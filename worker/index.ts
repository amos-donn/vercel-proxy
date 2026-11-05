/**
 * sosystem worker.
 *
 * Serves the built SPA and the JSON API:
 *   /api/auth/*      register, login, logout, session lookup
 *   /api/workspace   the account's workspace snapshot (D1, one row per user)
 *   /api/keys        encrypted BYOK provider keys + audit trail
 *   /api/mcp         connected MCP servers, tool discovery and tool calls
 *   /api/health      which lanes are configured (booleans only)
 *   /api/models      live catalogs for OpenRouter, Google AI Studio and Groq
 *   /api/jev         System 1 proxy
 *   /api/system2     System 2 proxy
 *   /api/web         agent web search and page reading
 *
 * Provider keys never reach the browser and are only decrypted inside the
 * Worker, immediately before an upstream call.
 */

import type { Env } from './db'
import { ensureSchema, one, run } from './db'
import { ApiError } from './errors'
import { clearedSessionCookie, getAuth, login, logout, register, sessionCookie } from './auth'
import type { AuthUser } from './auth'
import {
  deleteUserKey,
  getInventory,
  health,
  jevAnswer,
  listModels,
  setUserKey,
  system2,
  system2Stream,
} from './providers'
import {
  callMcpTool,
  createServer,
  deleteServer,
  listServers,
  refreshServer,
  updateServer,
} from './mcp'
import { readPage, webSearch } from './web'
import { defaultWorkspace } from '../src/data/defaults'

const MAX_SMALL_BODY = 128 * 1024
const MAX_WORKSPACE = 1024 * 1024

function json(body: unknown, status = 200, headers?: Headers): Response {
  const next = headers ?? new Headers()
  next.set('content-type', 'application/json; charset=utf-8')
  next.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: next })
}

async function readJson(request: Request, limit = MAX_SMALL_BODY): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > limit) throw new ApiError(413, 'body_too_large', 'That request body is too large.')
  let parsed: unknown
  try {
    parsed = JSON.parse(text || '{}')
  } catch {
    throw new ApiError(400, 'invalid_body', 'Request body must be JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'invalid_body', 'Request body must be an object.')
  }
  return parsed as Record<string, unknown>
}

/** Cookies are SameSite=Lax; this blocks any remaining cross-site write. */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (!origin) return
  const host = request.headers.get('host')
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ApiError(403, 'bad_origin', 'That request came from an unknown origin.')
  }
  if (!host || originHost !== host) {
    throw new ApiError(403, 'bad_origin', 'Cross-origin writes are not allowed.')
  }
}

async function requireUser(request: Request, env: Env): Promise<AuthUser> {
  const auth = await getAuth(request, env)
  if (!auth) throw new ApiError(401, 'unauthorized', 'Sign in to continue.')
  return auth.user
}

async function readWorkspace(env: Env, userId: string): Promise<{ workspace: unknown; updatedAt: number }> {
  const row = await one<{ data: string; updated_at: number }>(
    env.DB,
    'SELECT data, updated_at FROM workspaces WHERE user_id = ?',
    userId,
  )
  if (row) {
    try {
      return { workspace: JSON.parse(row.data), updatedAt: row.updated_at }
    } catch {
      // Fall through and reseed a corrupt snapshot.
    }
  }
  const seed = defaultWorkspace()
  const text = JSON.stringify(seed)
  const now = Date.now()
  await run(
    env.DB,
    `INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    userId,
    text,
    now,
  )
  return { workspace: seed, updatedAt: now }
}

async function saveWorkspace(env: Env, userId: string, body: Record<string, unknown>): Promise<number> {
  const snapshot = body.workspace
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ApiError(400, 'invalid_workspace', 'Send the workspace as an object.')
  }
  const text = JSON.stringify(snapshot)
  if (text.length > MAX_WORKSPACE) {
    throw new ApiError(413, 'workspace_too_large', 'This workspace is over the 1 MB limit.')
  }
  const now = Date.now()
  await run(
    env.DB,
    `INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    userId,
    text,
    now,
  )
  return now
}

function sessionResponse(
  body: unknown,
  token: string,
  secure: boolean,
  status = 200,
): Response {
  const headers = new Headers()
  headers.set('set-cookie', sessionCookie(token, secure))
  return json(body, status, headers)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    try {
      await ensureSchema(env.DB)
      const secure = url.protocol === 'https:'
      const method = request.method.toUpperCase()
      const path = url.pathname
      const write = method !== 'GET' && method !== 'HEAD'
      if (write) assertSameOrigin(request)

      /* ---------------------------------------------------------------- *
         Auth
       * ---------------------------------------------------------------- */

      if (path === '/api/auth/register') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        const result = await register(env, await readJson(request))
        return sessionResponse({ user: result.user }, result.token, secure, 201)
      }

      if (path === '/api/auth/login') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        const result = await login(env, await readJson(request))
        return sessionResponse({ user: result.user }, result.token, secure)
      }

      if (path === '/api/auth/logout') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        await logout(request, env)
        const headers = new Headers()
        headers.set('set-cookie', clearedSessionCookie(secure))
        return json({ ok: true }, 200, headers)
      }

      if (path === '/api/auth/me') {
        if (method !== 'GET') throw new ApiError(405, 'method_not_allowed')
        const user = await requireUser(request, env)
        return json({ user })
      }

      if (path === '/api/health') {
        if (method !== 'GET') throw new ApiError(405, 'method_not_allowed')
        const auth = await getAuth(request, env)
        return json(await health(env, auth?.user.id))
      }

      /* ---------------------------------------------------------------- *
         Workspace
       * ---------------------------------------------------------------- */

      if (path === '/api/workspace') {
        const user = await requireUser(request, env)
        if (method === 'GET') {
          const { workspace, updatedAt } = await readWorkspace(env, user.id)
          return json({ workspace, updatedAt })
        }
        if (method === 'PUT') {
          const updatedAt = await saveWorkspace(env, user.id, await readJson(request, MAX_WORKSPACE + 4096))
          return json({ ok: true, updatedAt })
        }
        throw new ApiError(405, 'method_not_allowed')
      }

      /* ---------------------------------------------------------------- *
         Provider keys
       * ---------------------------------------------------------------- */

      if (path === '/api/keys') {
        const user = await requireUser(request, env)
        if (method === 'GET') return json(await getInventory(env, user.id))
        if (method === 'PUT') {
          const body = await readJson(request)
          const name = typeof body.name === 'string' ? body.name : ''
          const value = typeof body.value === 'string' ? body.value : ''
          const provider = typeof body.provider === 'string' ? body.provider : undefined
          const key = await setUserKey(env, user.id, name, value, provider)
          return json({ key }, 201)
        }
        throw new ApiError(405, 'method_not_allowed')
      }

      if (path.startsWith('/api/keys/')) {
        const user = await requireUser(request, env)
        if (method !== 'DELETE') throw new ApiError(405, 'method_not_allowed')
        const name = decodeURIComponent(path.slice('/api/keys/'.length))
        await deleteUserKey(env, user.id, name)
        return json({ ok: true })
      }

      /* ---------------------------------------------------------------- *
         MCP servers
       * ---------------------------------------------------------------- */

      if (path === '/api/mcp') {
        const user = await requireUser(request, env)
        if (method === 'GET') return json({ servers: await listServers(env, user.id) })
        if (method === 'POST') {
          const server = await createServer(env, user.id, await readJson(request))
          return json({ server }, 201)
        }
        throw new ApiError(405, 'method_not_allowed')
      }

      if (path.startsWith('/api/mcp/')) {
        const user = await requireUser(request, env)
        const rest = path.slice('/api/mcp/'.length).split('/').filter(Boolean)
        const id = rest[0] ? decodeURIComponent(rest[0]) : ''
        if (!id) throw new ApiError(404, 'not_found')
        const action = rest[1]

        if (!action && method === 'PATCH') {
          const server = await updateServer(env, user.id, id, await readJson(request))
          return json({ server })
        }
        if (!action && method === 'DELETE') {
          await deleteServer(env, user.id, id)
          return json({ ok: true })
        }
        if (action === 'refresh' && method === 'POST') {
          return json({ server: await refreshServer(env, user.id, id) })
        }
        if (action === 'call' && method === 'POST') {
          const body = await readJson(request)
          const tool = typeof body.tool === 'string' ? body.tool : ''
          const args =
            body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
              ? (body.arguments as Record<string, unknown>)
              : {}
          const result = await callMcpTool(env, user.id, id, tool, args)
          return json(result)
        }
        throw new ApiError(405, 'method_not_allowed')
      }

      /* ---------------------------------------------------------------- *
         Model lanes
       * ---------------------------------------------------------------- */

      if (path === '/api/models') {
        if (method !== 'GET') throw new ApiError(405, 'method_not_allowed')
        const user = await requireUser(request, env)
        const provider = url.searchParams.get('provider') ?? 'openrouter'
        return json(await listModels(env, user.id, provider))
      }

      if (path === '/api/jev') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        const user = await requireUser(request, env)
        const answers = await jevAnswer(env, user.id, await readJson(request))
        return json({ answers })
      }

      if (path === '/api/system2') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        const user = await requireUser(request, env)
        return json(await system2(env, user.id, await readJson(request)))
      }

      // Token stream for the agent loop: the chat shows the model thinking
      // instead of a static "working" row for a minute.
      if (path === '/api/system2/stream') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        const user = await requireUser(request, env)
        const { stream } = await system2Stream(env, user.id, await readJson(request))
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            'x-accel-buffering': 'no',
          },
        })
      }

      if (path === '/api/web') {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        await requireUser(request, env)
        const body = await readJson(request)
        const action = typeof body.action === 'string' ? body.action : ''
        if (action === 'search') {
          const query = typeof body.query === 'string' ? body.query.trim().slice(0, 400) : ''
          if (!query) throw new ApiError(400, 'empty_query', 'A search query is required.')
          return json({ results: await webSearch(env, query) })
        }
        if (action === 'read') {
          const url = typeof body.url === 'string' ? body.url.trim().slice(0, 2_000) : ''
          if (!url) throw new ApiError(400, 'empty_url', 'A URL is required.')
          return json(await readPage(url))
        }
        throw new ApiError(400, 'bad_action', 'action must be "search" or "read".')
      }

      throw new ApiError(404, 'not_found', 'No such API route.')
    } catch (error) {
      if (error instanceof ApiError) {
        return json(
          { error: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) },
          error.status,
        )
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      return json({ error: 'internal_error', message: message.slice(0, 300) }, 500)
    }
  },
}
