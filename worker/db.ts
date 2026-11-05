export interface D1Result<T = Record<string, unknown>> {
  results?: T[]
  success: boolean
  meta?: Record<string, unknown>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
}

export type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  DB: D1Database
  SOSYSTEM_SECRET?: string
  SOSYSTEM_ENVIRONMENT?: string
  ALLOW_PRIVATE_MCP?: string
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  GEMINI_API_KEY?: string
  GOOGLE_API_KEY?: string
  GROQ_API_KEY?: string
  GROQ_BASE_URL?: string
  OPENROUTER_API_KEY?: string
  SYSTEM2_API_KEY?: string
  SYSTEM2_BASE_URL?: string
  SYSTEM2_MODEL?: string
  /** Exa web search key for the agent's web_search tool. */
  EXA_API_KEY?: string
  [key: string]: unknown
}

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    masked TEXT NOT NULL,
    cipher TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_used_at INTEGER,
    UNIQUE(user_id, name)
  )`,
  `CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    key_name TEXT NOT NULL,
    outcome TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_log(user_id, at DESC)`,
  `CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    transport TEXT NOT NULL,
    auth_cipher TEXT,
    auth_iv TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'available',
    error TEXT,
    tools_json TEXT,
    tools_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mcp_user_idx ON mcp_servers(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
]

const ready = new WeakMap<object, Promise<void>>()

export function ensureSchema(db: D1Database): Promise<void> {
  const existing = ready.get(db as object)
  if (existing) return existing
  const pending = (async () => {
    for (const statement of schema) {
      await db.prepare(statement).run()
    }
  })()
  ready.set(db as object, pending)
  pending.catch(() => ready.delete(db as object))
  return pending
}

export async function one<T>(db: D1Database, query: string, ...values: unknown[]): Promise<T | null> {
  return db.prepare(query).bind(...values).first<T>()
}

export async function all<T>(db: D1Database, query: string, ...values: unknown[]): Promise<T[]> {
  const result = await db.prepare(query).bind(...values).all<T>()
  return result.results ?? []
}

export async function run(db: D1Database, query: string, ...values: unknown[]): Promise<void> {
  await db.prepare(query).bind(...values).run()
}
