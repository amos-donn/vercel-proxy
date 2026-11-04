import type { D1Database, Env } from './db'
import { one, run } from './db'

const encoder = new TextEncoder()
/**
 * Cloudflare Workers rejects PBKDF2 iteration counts above 100,000, so 100k is
 * the strongest setting the platform allows. Existing hashes embed their own
 * count and are verified against it when the runtime permits.
 */
const PASSWORD_ITERATIONS = 100_000
const MAX_PBKDF2_ITERATIONS = 100_000
const KEY_CACHE = new WeakMap<object, Promise<{ key: CryptoKey; custody: 'worker-secret' | 'd1-fallback' }>>()

export type Bytes = Uint8Array<ArrayBuffer>

const alloc = (length: number): Bytes => new Uint8Array(new ArrayBuffer(length))

function bytesOf(text: string): Bytes {
  const encoded = encoder.encode(text)
  const copy = alloc(encoded.length)
  copy.set(encoded)
  return copy
}

export function randomBytes(length: number): Bytes {
  const bytes = alloc(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBytes(value: string): Bytes {
  const binary = atob(value)
  const bytes = alloc(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function randomToken(bytes = 32): string {
  return base64Url(randomBytes(bytes))
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytesOf(value))
  return base64Url(new Uint8Array(digest))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const bits = await derivePassword(password, salt, PASSWORD_ITERATIONS)
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsValue, saltValue, hashValue] = stored.split('$')
  if (algorithm !== 'pbkdf2' || !iterationsValue || !saltValue || !hashValue) return false
  const iterations = Number(iterationsValue)
  if (!Number.isFinite(iterations) || iterations < 10_000) return false
  const salt = base64ToBytes(saltValue)
  if (iterations > MAX_PBKDF2_ITERATIONS) {
    // Hashes above the Workers ceiling only verify on runtimes without the cap.
    try {
      const legacy = await derivePassword(password, salt, iterations)
      return safeEqual(legacy, base64ToBytes(hashValue))
    } catch {
      return false
    }
  }
  const bits = await derivePassword(password, salt, iterations)
  return safeEqual(bits, base64ToBytes(hashValue))
}

async function derivePassword(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const material = await crypto.subtle.importKey('raw', bytesOf(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    256,
  )
  return new Uint8Array(bits)
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

async function encryptionMaterial(
  env: Env,
  db: D1Database,
): Promise<{ key: CryptoKey; custody: 'worker-secret' | 'd1-fallback' }> {
  const cached = KEY_CACHE.get(db as object)
  if (cached) return cached

  const pending = (async () => {
    let raw: Bytes
    let custody: 'worker-secret' | 'd1-fallback'
    const secret = typeof env.SOSYSTEM_SECRET === 'string' ? env.SOSYSTEM_SECRET.trim() : ''
    if (secret) {
      raw = new Uint8Array(await crypto.subtle.digest('SHA-256', bytesOf(secret)))
      custody = 'worker-secret'
    } else {
      let stored = await one<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', 'encryption_key')
      if (!stored) {
        const generated = bytesToBase64(randomBytes(32))
        await run(db, 'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', 'encryption_key', generated)
        stored = await one<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', 'encryption_key')
      }
      if (!stored) throw new Error('Could not initialize encryption key')
      raw = base64ToBytes(stored.value)
      custody = 'd1-fallback'
    }
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    return { key, custody }
  })()

  KEY_CACHE.set(db as object, pending)
  pending.catch(() => KEY_CACHE.delete(db as object))
  return pending
}

export async function encryptionCustody(
  env: Env,
  db: D1Database,
): Promise<'worker-secret' | 'd1-fallback'> {
  return (await encryptionMaterial(env, db)).custody
}

export async function encryptSecret(
  env: Env,
  db: D1Database,
  plaintext: string,
): Promise<{ cipher: string; iv: string }> {
  const { key } = await encryptionMaterial(env, db)
  const iv = randomBytes(12)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytesOf(plaintext))
  return { cipher: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) }
}

export async function decryptSecret(
  env: Env,
  db: D1Database,
  cipher: string,
  iv: string,
): Promise<string> {
  const { key } = await encryptionMaterial(env, db)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToBytes(cipher),
  )
  return new TextDecoder().decode(decrypted)
}

export function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '••••'
  const tail = trimmed.slice(-4)
  return `••••${tail}`
}
