import type {
  ApiKeyMeta,
  KeyEvent,
  KeyInventory,
  McpCallResult,
  McpServer,
  McpTransport,
  ProviderStatus,
  SessionUser,
  WorkspaceSnapshot,
} from '../types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string

  constructor(status: number, code: string, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the Worker.')
  }

  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new ApiError(
      response.status,
      'not_attached',
      'The Worker is not attached to this origin. Run it with `npx wrangler dev`.',
    )
  }

  const body = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof body.error === 'string' ? body.error : 'request_failed',
      typeof body.message === 'string' ? body.message : 'That request failed.',
      typeof body.detail === 'string' ? body.detail : undefined,
    )
  }
  return body as T
}

const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export interface KeyInventoryResponse extends KeyInventory {
  providers: Record<string, ProviderStatus>
}

export const api = {
  me: () => request<{ user: SessionUser }>('/api/auth/me'),
  login: (email: string, password: string) =>
    post<{ user: SessionUser }>('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    post<{ user: SessionUser }>('/api/auth/register', { name, email, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout', {}),

  health: () =>
    request<{ ok: boolean; authenticated: boolean; jev: boolean; system2: boolean; keyCustody: string }>(
      '/api/health',
    ),

  workspace: () => request<{ workspace: WorkspaceSnapshot; updatedAt: number }>('/api/workspace'),
  saveWorkspace: (workspace: WorkspaceSnapshot) =>
    request<{ ok: true; updatedAt: number }>('/api/workspace', {
      method: 'PUT',
      body: JSON.stringify({ workspace }),
    }),

  keys: () => request<KeyInventoryResponse>('/api/keys'),
  saveKey: (name: string, value: string, provider?: string) =>
    request<{ key: ApiKeyMeta }>('/api/keys', {
      method: 'PUT',
      body: JSON.stringify({ name, value, provider }),
    }),
  deleteKey: (name: string) =>
    request<{ ok: true }>(`/api/keys/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  mcpServers: () => request<{ servers: McpServer[] }>('/api/mcp'),
  createMcp: (input: { name: string; url: string; transport: McpTransport; auth?: string }) =>
    post<{ server: McpServer }>('/api/mcp', input),
  updateMcp: (id: string, patch: Record<string, unknown>) =>
    request<{ server: McpServer }>(`/api/mcp/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMcp: (id: string) =>
    request<{ ok: true }>(`/api/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  refreshMcp: (id: string) =>
    post<{ server: McpServer }>(`/api/mcp/${encodeURIComponent(id)}/refresh`, {}),
  callMcp: (id: string, tool: string, args: Record<string, unknown>) =>
    post<McpCallResult>(`/api/mcp/${encodeURIComponent(id)}/call`, { tool, arguments: args }),
}

export type { KeyEvent }
