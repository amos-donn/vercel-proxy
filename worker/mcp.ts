import type { Env } from './db'
import { all, one, run } from './db'
import { ApiError } from './errors'
import { decryptSecret, encryptSecret } from './crypto'
import type { McpServer, McpTool, McpTransport } from '../src/types'

interface ServerRow {
  id: string
  user_id: string
  name: string
  url: string
  transport: string
  auth_cipher: string | null
  auth_iv: string | null
  enabled: number
  status: string
  error: string | null
  tools_json: string | null
  tools_count: number
  created_at: number
  updated_at: number
}

const MAX_TOOLS = 100
const MAX_AUTH = 4096
const PROTOCOL_VERSIONS = ['2025-06-18', '2024-11-05']

export function rowToServer(row: ServerRow): McpServer {
  let tools: McpTool[] = []
  if (row.tools_json) {
    try {
      const parsed = JSON.parse(row.tools_json) as unknown
      if (Array.isArray(parsed)) {
        tools = parsed
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            name: typeof item.name === 'string' ? item.name : 'tool',
            ...(typeof item.description === 'string' ? { description: item.description } : {}),
            ...(item.inputSchema && typeof item.inputSchema === 'object'
              ? { inputSchema: item.inputSchema as Record<string, unknown> }
              : {}),
          }))
          .slice(0, MAX_TOOLS)
      }
    } catch {
      tools = []
    }
  }
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport === 'sse' ? 'sse' : 'streamable-http',
    enabled: Boolean(row.enabled),
    status: row.status === 'connected' ? 'connected' : row.status === 'error' ? 'error' : 'available',
    authSet: Boolean(row.auth_cipher),
    tools,
    toolsCount: row.tools_count || tools.length,
    ...(row.error ? { error: row.error.slice(0, 500) } : {}),
    updatedAt: row.updated_at,
  }
}

export async function listServers(env: Env, userId: string): Promise<McpServer[]> {
  const rows = await all<ServerRow>(env.DB, 'SELECT * FROM mcp_servers WHERE user_id = ? ORDER BY created_at DESC', userId)
  return rows.map(rowToServer)
}

async function loadRow(env: Env, userId: string, id: string): Promise<ServerRow> {
  const row = await one<ServerRow>(env.DB, 'SELECT * FROM mcp_servers WHERE id = ? AND user_id = ?', id, userId)
  if (!row) throw new ApiError(404, 'mcp_not_found', 'That MCP server is not in this workspace.')
  return row
}

async function authToken(env: Env, row: ServerRow): Promise<string | undefined> {
  if (!row.auth_cipher || !row.auth_iv) return undefined
  return decryptSecret(env, env.DB, row.auth_cipher, row.auth_iv)
}

function validateUrl(env: Env, raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ApiError(400, 'invalid_mcp_url', 'Enter a valid MCP endpoint URL.')
  }
  const dev = env.ALLOW_PRIVATE_MCP === '1'
  if (url.protocol !== 'https:' && !(dev && url.protocol === 'http:')) {
    throw new ApiError(400, 'invalid_mcp_url', 'MCP endpoints must use HTTPS.')
  }
  if (url.username || url.password) throw new ApiError(400, 'invalid_mcp_url', 'Do not put credentials in the URL.')
  if (!dev) {
    const host = url.hostname.toLowerCase()
    const privateHost =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '::1' ||
      host === '[::1]'
    if (privateHost) throw new ApiError(400, 'invalid_mcp_url', 'Private network endpoints are not allowed.')
  }
  return url.toString()
}

interface RpcResponse<T> {
  result?: T
  error?: { code?: number; message?: string }
}

async function rpc<T>(
  url: string,
  auth: string | undefined,
  method: string,
  params: Record<string, unknown> | undefined,
  id: number | null,
  sessionId?: string,
): Promise<{ value: T | null; sessionId?: string }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (auth) headers.authorization = `Bearer ${auth}`
  if (sessionId) headers['mcp-session-id'] = sessionId
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      ...(id === null ? {} : { id }),
      method,
      ...(params ? { params } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const nextSession = response.headers.get('mcp-session-id') ?? sessionId
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new ApiError(502, 'mcp_upstream', `MCP server returned ${response.status}.`, detail)
  }
  if (id === null || response.status === 202 || response.status === 204) return { value: null, sessionId: nextSession }
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  let payload: RpcResponse<T> | null = null
  if (contentType.includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : ''
      if (!data || data === '[DONE]') continue
      try {
        const candidate = JSON.parse(data) as RpcResponse<T> & { id?: number }
        if (candidate.id === id || candidate.result || candidate.error) payload = candidate
      } catch {
        // Keep scanning the event stream.
      }
    }
  } else {
    try {
      payload = JSON.parse(text) as RpcResponse<T>
    } catch {
      throw new ApiError(502, 'mcp_invalid_response', 'MCP server returned an unreadable response.')
    }
  }
  if (!payload) throw new ApiError(502, 'mcp_invalid_response', 'MCP server returned no JSON-RPC payload.')
  if (payload.error) {
    throw new ApiError(502, 'mcp_rpc_error', payload.error.message || 'MCP server rejected the request.')
  }
  return { value: payload.result ?? null, sessionId: nextSession }
}

async function initialize(url: string, auth?: string): Promise<{ sessionId?: string; protocol: string }> {
  let lastError: unknown
  for (const protocol of PROTOCOL_VERSIONS) {
    try {
      const response = await rpc<unknown>(
        url,
        auth,
        'initialize',
        {
          protocolVersion: protocol,
          capabilities: { tools: {} },
          clientInfo: { name: 'Mezze', version: '0.4.1' },
        },
        1,
      )
      const sessionId = response.sessionId
      await rpc<unknown>(url, auth, 'notifications/initialized', undefined, null, sessionId).catch(() => undefined)
      return { sessionId, protocol }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('MCP initialization failed')
}

export async function discoverTools(env: Env, row: ServerRow): Promise<McpTool[]> {
  const auth = await authToken(env, row)
  const { sessionId } = await initialize(row.url, auth)
  const tools: McpTool[] = []
  let cursor: string | undefined
  for (let page = 0; page < 4; page += 1) {
    const response = await rpc<{ tools?: unknown[]; nextCursor?: string }>(
      row.url,
      auth,
      'tools/list',
      cursor ? { cursor } : {},
      10 + page,
      sessionId,
    )
    const list = Array.isArray(response.value?.tools) ? response.value.tools : []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const tool = item as Record<string, unknown>
      if (typeof tool.name !== 'string') continue
      tools.push({
        name: tool.name,
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
        ...(tool.inputSchema && typeof tool.inputSchema === 'object'
          ? { inputSchema: tool.inputSchema as Record<string, unknown> }
          : {}),
      })
      if (tools.length >= MAX_TOOLS) break
    }
    cursor = typeof response.value?.nextCursor === 'string' ? response.value.nextCursor : undefined
    if (!cursor || tools.length >= MAX_TOOLS) break
  }
  return tools
}

async function refreshRow(env: Env, row: ServerRow): Promise<ServerRow> {
  const now = Date.now()
  try {
    const tools = await discoverTools(env, row)
    await run(
      env.DB,
      "UPDATE mcp_servers SET status = 'connected', error = NULL, tools_json = ?, tools_count = ?, updated_at = ? WHERE id = ?",
      JSON.stringify(tools),
      tools.length,
      now,
      row.id,
    )
    return { ...row, status: 'connected', error: null, tools_json: JSON.stringify(tools), tools_count: tools.length, updated_at: now }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'MCP discovery failed.'
    await run(env.DB, "UPDATE mcp_servers SET status = 'error', error = ?, updated_at = ? WHERE id = ?", message, now, row.id)
    return { ...row, status: 'error', error: message, updated_at: now }
  }
}

export async function createServer(
  env: Env,
  userId: string,
  body: Record<string, unknown>,
): Promise<McpServer> {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) throw new ApiError(400, 'invalid_mcp_name', 'Give the MCP server a name.')
  const url = validateUrl(env, typeof body.url === 'string' ? body.url.trim() : '')
  const transport: McpTransport = body.transport === 'sse' ? 'sse' : 'streamable-http'
  const token = typeof body.auth === 'string' ? body.auth.trim() : ''
  if (token.length > MAX_AUTH) throw new ApiError(400, 'invalid_mcp_auth', 'MCP token is too long.')
  const encrypted = token ? await encryptSecret(env, env.DB, token) : null
  const id = crypto.randomUUID()
  const now = Date.now()
  await run(
    env.DB,
    `INSERT INTO mcp_servers
      (id, user_id, name, url, transport, auth_cipher, auth_iv, enabled, status, error, tools_json, tools_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'available', NULL, '[]', 0, ?, ?)`,
    id,
    userId,
    name,
    url,
    transport,
    encrypted?.cipher ?? null,
    encrypted?.iv ?? null,
    now,
    now,
  )
  const row = await loadRow(env, userId, id)
  return rowToServer(await refreshRow(env, row))
}

export async function updateServer(
  env: Env,
  userId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<McpServer> {
  const row = await loadRow(env, userId, id)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : row.name
  if (!name) throw new ApiError(400, 'invalid_mcp_name', 'Give the MCP server a name.')
  const url = body.url === undefined ? row.url : validateUrl(env, String(body.url).trim())
  const transport: McpTransport = body.transport === 'sse' ? 'sse' : body.transport === 'streamable-http' ? 'streamable-http' : (row.transport as McpTransport)
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : row.enabled
  let authCipher = row.auth_cipher
  let authIv = row.auth_iv
  if (typeof body.auth === 'string' && body.auth.trim()) {
    if (body.auth.trim().length > MAX_AUTH) throw new ApiError(400, 'invalid_mcp_auth', 'MCP token is too long.')
    const encrypted = await encryptSecret(env, env.DB, body.auth.trim())
    authCipher = encrypted.cipher
    authIv = encrypted.iv
  }
  const changedEndpoint = url !== row.url || authCipher !== row.auth_cipher
  const now = Date.now()
  await run(
    env.DB,
    `UPDATE mcp_servers SET name = ?, url = ?, transport = ?, enabled = ?, auth_cipher = ?, auth_iv = ?, updated_at = ?,
      status = CASE WHEN ? THEN 'available' ELSE status END,
      error = CASE WHEN ? THEN NULL ELSE error END,
      tools_json = CASE WHEN ? THEN '[]' ELSE tools_json END,
      tools_count = CASE WHEN ? THEN 0 ELSE tools_count END
     WHERE id = ? AND user_id = ?`,
    name,
    url,
    transport,
    enabled,
    authCipher,
    authIv,
    now,
    changedEndpoint ? 1 : 0,
    changedEndpoint ? 1 : 0,
    changedEndpoint ? 1 : 0,
    changedEndpoint ? 1 : 0,
    id,
    userId,
  )
  const updated = await loadRow(env, userId, id)
  return rowToServer(updated)
}

export async function refreshServer(env: Env, userId: string, id: string): Promise<McpServer> {
  return rowToServer(await refreshRow(env, await loadRow(env, userId, id)))
}

export async function deleteServer(env: Env, userId: string, id: string): Promise<void> {
  await loadRow(env, userId, id)
  await run(env.DB, 'DELETE FROM mcp_servers WHERE id = ? AND user_id = ?', id, userId)
}

export async function callMcpTool(
  env: Env,
  userId: string,
  id: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ content: string; raw: unknown }> {
  const row = await loadRow(env, userId, id)
  const cleanTool = tool.trim()
  if (!cleanTool) throw new ApiError(400, 'invalid_tool', 'Choose an MCP tool to call.')
  const auth = await authToken(env, row)
  const { sessionId } = await initialize(row.url, auth)
  const response = await rpc<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }>(
    row.url,
    auth,
    'tools/call',
    { name: cleanTool, arguments: args },
    21,
    sessionId,
  )
  if (response.value?.isError) {
    throw new ApiError(502, 'mcp_tool_error', 'The MCP tool reported an error.')
  }
  const content = (response.value?.content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
  return { content: content || JSON.stringify(response.value ?? null, null, 2), raw: response.value }
}
