import type { Env } from './db'
import { one, run } from './db'
import { ApiError } from './errors'
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto'

const COOKIE = 'sosystem_session'
const SESSION_AGE = 60 * 60 * 24 * 30

interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string
  created_at: number
}

export interface AuthUser {
  id: string
  email: string
  name: string
  createdAt: number
}

export interface AuthResult {
  user: AuthUser
  token: string
}

export function publicUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at }
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_email', 'Enter an email address.')
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'invalid_email', 'Enter a valid email address.')
  }
  return email
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_name', 'Enter your name.')
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 80) throw new ApiError(400, 'invalid_name', 'Use a name under 80 characters.')
  return name
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new ApiError(400, 'invalid_password', 'Use a password between 8 and 200 characters.')
  }
  return value
}

function decodeCookie(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') ?? ''
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        // A malformed cookie (`%`, cut escape) must not 500 every API call.
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeCookie(part.slice(index + 1))]
      }),
  )
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32)
  const now = Date.now()
  await run(
    env.DB,
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    await sha256(token),
    userId,
    now + SESSION_AGE * 1000,
    now,
  )
  await run(env.DB, 'DELETE FROM sessions WHERE expires_at < ?', now)
  return token
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE}${secure ? '; Secure' : ''}`
}

export function clearedSessionCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export async function getAuth(request: Request, env: Env): Promise<{ user: AuthUser; tokenHash: string } | null> {
  const token = parseCookies(request)[COOKIE]
  if (!token) return null
  const tokenHash = await sha256(token)
  const row = await one<UserRow & { expires_at: number }>(
    env.DB,
    `SELECT users.*, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`,
    tokenHash,
    Date.now(),
  )
  if (!row) return null
  return { user: publicUser(row), tokenHash }
}

export async function register(env: Env, body: Record<string, unknown>): Promise<AuthResult> {
  const email = normalizeEmail(body.email)
  const name = normalizeName(body.name)
  const password = normalizePassword(body.password)
  const existing = await one<{ id: string }>(env.DB, 'SELECT id FROM users WHERE email = ?', email)
  if (existing) throw new ApiError(409, 'email_taken', 'An account with that email already exists.')
  const id = crypto.randomUUID()
  const now = Date.now()
  try {
    await run(
      env.DB,
      'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      email,
      name,
      await hashPassword(password),
      now,
    )
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new ApiError(409, 'email_taken', 'An account with that email already exists.')
    }
    throw error
  }
  const user = await one<UserRow>(env.DB, 'SELECT * FROM users WHERE id = ?', id)
  if (!user) throw new Error('User insert failed')
  return { user: publicUser(user), token: await createSession(env, id) }
}

export async function login(env: Env, body: Record<string, unknown>): Promise<AuthResult> {
  const email = normalizeEmail(body.email)
  const password = normalizePassword(body.password)
  const row = await one<UserRow>(env.DB, 'SELECT * FROM users WHERE email = ?', email)
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.')
  }
  return { user: publicUser(row), token: await createSession(env, row.id) }
}

export async function logout(request: Request, env: Env): Promise<void> {
  const auth = await getAuth(request, env)
  if (auth) await run(env.DB, 'DELETE FROM sessions WHERE id = ?', auth.tokenHash)
}
