import type { D1Database, Env } from './db'
import { all, one, run } from './db'
import { ApiError } from './errors'
import { decryptSecret, encryptSecret, encryptionCustody, maskSecret } from './crypto'
import {
  isLiveCatalogProvider,
  liveCatalogProviders,
  modelForProvider,
  modelLabel,
  providerByKeyName,
  providerForModel,
  providers,
} from '../src/data/providers'
import type { ProviderId } from '../src/data/providers'
import type { ModelCatalog, ModelOption } from '../src/types'

interface ApiKeyRow {
  id: string
  user_id: string
  name: string
  provider: string
  masked: string
  cipher: string
  iv: string
  created_at: number
  updated_at: number
  last_used_at: number | null
}

interface AuditRow {
  id: string
  action: string
  key_name: string
  outcome: string
  at: number
}

export interface KeyView {
  id: string
  name: string
  provider: string
  masked: string
  source: 'user' | 'worker'
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

export interface KeyEventView {
  id: string
  action: string
  key: string
  outcome: string
  at: number
}

export interface KeyInventory {
  keys: KeyView[]
  audit: KeyEventView[]
  providers: Record<string, { configured: boolean; masked?: string; source?: 'user' | 'worker' }>
}

const S2_DEFAULT = 'claude-sonnet-5'
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 24_000
const MAX_RESPONSE_CHARS = 500

const keyFor = (row: ApiKeyRow): KeyView => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  masked: row.masked,
  source: 'user',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}),
})

const envValue = (env: Env, names: string[]): string | undefined => {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

async function rowsFor(db: D1Database, userId: string): Promise<ApiKeyRow[]> {
  return all<ApiKeyRow>(db, 'SELECT * FROM api_keys WHERE user_id = ? ORDER BY name', userId)
}

export async function getInventory(env: Env, userId: string): Promise<KeyInventory> {
  const [rows, auditRows] = await Promise.all([
    rowsFor(env.DB, userId),
    all<AuditRow>(env.DB, 'SELECT id, action, key_name, outcome, at FROM audit_log WHERE user_id = ? ORDER BY at DESC LIMIT 30', userId),
  ])
  const keys: KeyView[] = []
  const providerStatus: KeyInventory['providers'] = {}

  for (const definition of providers) {
    const row = rows.find((item) => item.name === definition.keyName)
    if (row) {
      keys.push(keyFor(row))
      providerStatus[definition.id] = { configured: true, masked: row.masked, source: 'user' }
      continue
    }
    const envKey = envValue(env, definition.envNames)
    if (envKey) {
      keys.push({
        id: `env_${definition.id}`,
        name: definition.keyName,
        provider: definition.id,
        masked: maskSecret(envKey),
        source: 'worker',
        createdAt: 0,
        updatedAt: 0,
      })
      providerStatus[definition.id] = { configured: true, masked: maskSecret(envKey), source: 'worker' }
    } else {
      providerStatus[definition.id] = { configured: false }
    }
  }

  for (const row of rows) {
    if (providers.some((definition) => definition.keyName === row.name)) continue
    keys.push(keyFor(row))
  }

  keys.sort((a, b) => a.name.localeCompare(b.name))
  return {
    keys,
    audit: auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      key: row.key_name,
      outcome: row.outcome,
      at: row.at,
    })),
    providers: providerStatus,
  }
}

async function getKey(env: Env, userId: string, provider: ProviderId): Promise<string | null> {
  const definition = providers.find((item) => item.id === provider)
  if (!definition) return null
  const row = await one<ApiKeyRow>(
    env.DB,
    'SELECT * FROM api_keys WHERE user_id = ? AND name = ?',
    userId,
    definition.keyName,
  )
  if (row) {
    const value = await decryptSecret(env, env.DB, row.cipher, row.iv)
    await run(env.DB, 'UPDATE api_keys SET last_used_at = ? WHERE id = ?', Date.now(), row.id)
    return value
  }
  return envValue(env, definition.envNames) ?? null
}

const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000
const modelCatalogCache = new Map<string, { at: number; catalog: ModelCatalog }>()
const CATALOG_LABELS = {
  openrouter: 'OpenRouter',
  google: 'Google AI Studio',
  groq: 'Groq',
} as const

/** Live provider metadata for the Settings picker. Platform keys work through getKey. */
export async function listModels(env: Env, userId: string, provider: string): Promise<ModelCatalog> {
  if (!isLiveCatalogProvider(provider)) {
    const supported = liveCatalogProviders
      .map((id) => providers.find((item) => item.id === id)?.name ?? id)
      .join(', ')
    throw new ApiError(400, 'unsupported_provider', `Live catalogs are available for ${supported}.`)
  }
  const key = await getKey(env, userId, provider)
  if (!key) {
    const definition = providers.find((item) => item.id === provider)
    throw new ApiError(
      503,
      'provider_not_configured',
      `Add a ${definition?.name ?? provider} key to load its model catalog.`,
      provider,
    )
  }
  const cacheKey = `${provider}:${userId}`
  const cached = modelCatalogCache.get(cacheKey)
  if (cached && Date.now() - cached.at < MODEL_CATALOG_TTL_MS) return cached.catalog

  const models =
    provider === 'openrouter'
      ? await openRouterCatalog(key)
      : provider === 'google'
        ? await googleCatalog(key)
        : await groqCatalog(env, key)
  if (!models.length) {
    throw new ApiError(502, 'models_empty', `${CATALOG_LABELS[provider]} returned no usable chat models.`)
  }
  const catalog: ModelCatalog = { provider, models, fetchedAt: Date.now() }
  modelCatalogCache.set(cacheKey, { at: Date.now(), catalog })
  return catalog
}

async function openRouterCatalog(key: string): Promise<ModelOption[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://sosystem.amos-donn.workers.dev',
      'X-Title': 'Mezze',
    },
  })
  if (!response.ok) throw upstreamError('OpenRouter', response.status, await response.text())
  return normalizeOpenRouterModels(await response.json())
}

async function googleCatalog(key: string): Promise<ModelOption[]> {
  const rows: unknown[] = []
  let pageToken = ''
  for (let page = 0; page < 5; page += 1) {
    const requestUrl = new URL('https://generativelanguage.googleapis.com/v1beta/models')
    requestUrl.searchParams.set('pageSize', '1000')
    if (pageToken) requestUrl.searchParams.set('pageToken', pageToken)
    const response = await fetch(requestUrl.toString(), {
      headers: { accept: 'application/json', 'x-goog-api-key': key },
    })
    if (!response.ok) throw upstreamError('Google AI Studio', response.status, await response.text())
    const payload = (await response.json()) as { models?: unknown; nextPageToken?: unknown }
    if (Array.isArray(payload.models)) rows.push(...payload.models)
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : ''
    if (!pageToken) break
  }
  return normalizeGoogleModels({ models: rows })
}

async function groqCatalog(env: Env, key: string): Promise<ModelOption[]> {
  const base = (
    typeof env.GROQ_BASE_URL === 'string' && env.GROQ_BASE_URL.trim()
      ? env.GROQ_BASE_URL
      : 'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '')
  const response = await fetch(`${base}/models`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${key}`,
    },
  })
  if (!response.ok) throw upstreamError('Groq', response.status, await response.text())
  return normalizeGroqModels(await response.json())
}

export function normalizeGoogleModels(payload: unknown): ModelOption[] {
  const rows =
    payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : []
  const seen = new Set<string>()
  const models: ModelOption[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!name) continue
    const withoutPrefix = name.startsWith('models/') ? name.slice(7) : name
    const rawId = withoutPrefix.startsWith('google:') ? withoutPrefix.slice(7) : withoutPrefix
    if (!rawId || rawId.length > 150) continue
    const methods = Array.isArray(row.supportedGenerationMethods)
      ? row.supportedGenerationMethods.filter((item): item is string => typeof item === 'string')
      : []
    if (!methods.includes('generateContent')) continue
    const id = `google:${rawId}`
    if (seen.has(id)) continue
    seen.add(id)
    const label =
      typeof row.displayName === 'string' && row.displayName.trim()
        ? row.displayName.trim().slice(0, 140)
        : rawId
    const context = Number(row.inputTokenLimit)
    models.push({
      id,
      name: label,
      context: Number.isFinite(context) && context > 0 ? context : 0,
    })
  }
  return models.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function normalizeGroqModels(payload: unknown): ModelOption[] {
  const rows =
    payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : []
  const seen = new Set<string>()
  const models: ModelOption[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const name = typeof row.id === 'string' ? row.id.trim() : ''
    if (!name || name.length > 150 || row.active === false) continue
    if (/(whisper|tts|playai)/i.test(name)) continue
    const rawId = name.startsWith('groq:') ? name.slice(5) : name
    const id = `groq:${rawId}`
    if (seen.has(id)) continue
    seen.add(id)
    const label =
      typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name.trim().slice(0, 140)
        : typeof row.name === 'string' && row.name.trim()
          ? row.name.trim().slice(0, 140)
          : rawId
    const context = Number(row.context_window ?? row.context_length ?? row.max_context_window)
    models.push({
      id,
      name: label,
      context: Number.isFinite(context) && context > 0 ? context : 0,
    })
  }
  return models.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function normalizeOpenRouterModels(payload: unknown): ModelOption[] {
  const data =
    payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : []
  const seen = new Set<string>()
  const models: ModelOption[] = []
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id || id.length > 160 || seen.has(id)) continue
    seen.add(id)
    const name =
      typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 140) : id
    const context = Number(row.context_length)
    const pricing =
      row.pricing && typeof row.pricing === 'object'
        ? (row.pricing as Record<string, unknown>)
        : {}
    const promptPerMillion = perMillion(pricing.prompt)
    const completionPerMillion = perMillion(pricing.completion)
    models.push({
      id,
      name,
      ...(Number.isFinite(context) && context > 0 ? { context } : { context: 0 }),
      ...(promptPerMillion !== undefined ? { promptPerMillion } : {}),
      ...(completionPerMillion !== undefined ? { completionPerMillion } : {}),
    })
  }
  return models.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function perMillion(value: unknown): number | undefined {
  const amount = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return Number((amount * 1_000_000).toFixed(3))
}

export async function setUserKey(
  env: Env,
  userId: string,
  name: string,
  value: string,
  providerHint?: string,
): Promise<KeyView> {
  const cleanName = name.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(cleanName)) {
    throw new ApiError(400, 'invalid_key_name', 'Use upper snake case, e.g. OPENAI_API_KEY.')
  }
  const cleanValue = value.trim()
  if (!cleanValue || cleanValue.length > 4096) {
    throw new ApiError(400, 'invalid_key_value', 'The key must be between 1 and 4096 characters.')
  }
  const known = providerByKeyName(cleanName)
  const provider = known?.id ?? (providerHint && /^[a-z0-9_-]{2,32}$/.test(providerHint) ? providerHint : 'custom')
  const encrypted = await encryptSecret(env, env.DB, cleanValue)
  const existing = await one<ApiKeyRow>(env.DB, 'SELECT * FROM api_keys WHERE user_id = ? AND name = ?', userId, cleanName)
  const now = Date.now()
  const id = existing?.id ?? crypto.randomUUID()
  if (existing) {
    await run(
      env.DB,
      'UPDATE api_keys SET provider = ?, masked = ?, cipher = ?, iv = ?, updated_at = ? WHERE id = ?',
      provider,
      maskSecret(cleanValue),
      encrypted.cipher,
      encrypted.iv,
      now,
      id,
    )
    await audit(env, userId, 'replaced', cleanName, 'ok')
  } else {
    await run(
      env.DB,
      'INSERT INTO api_keys (id, user_id, name, provider, masked, cipher, iv, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      userId,
      cleanName,
      provider,
      maskSecret(cleanValue),
      encrypted.cipher,
      encrypted.iv,
      now,
      now,
    )
    await audit(env, userId, 'created', cleanName, 'ok')
  }
  return {
    id,
    name: cleanName,
    provider,
    masked: maskSecret(cleanValue),
    source: 'user',
    createdAt: existing?.created_at ?? now,
    updatedAt: now,
  }
}

export async function deleteUserKey(env: Env, userId: string, name: string): Promise<void> {
  const cleanName = name.trim().toUpperCase()
  const existing = await one<ApiKeyRow>(env.DB, 'SELECT * FROM api_keys WHERE user_id = ? AND name = ?', userId, cleanName)
  if (!existing) throw new ApiError(404, 'key_not_found', 'That key is not stored for this account.')
  await run(env.DB, 'DELETE FROM api_keys WHERE id = ?', existing.id)
  await audit(env, userId, 'deleted', cleanName, 'ok')
}

async function audit(env: Env, userId: string, action: string, key: string, outcome: 'ok' | 'denied'): Promise<void> {
  await run(
    env.DB,
    'INSERT INTO audit_log (id, user_id, action, key_name, outcome, at) VALUES (?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    userId,
    action,
    key,
    outcome,
    Date.now(),
  )
}

export async function health(env: Env, userId?: string): Promise<Record<string, unknown>> {
  const inventory = userId
    ? await getInventory(env, userId)
    : ({ keys: [], audit: [], providers: {} } as KeyInventory)
  if (!userId) {
    for (const definition of providers) {
      const envKey = envValue(env, definition.envNames)
      inventory.providers[definition.id] = envKey
        ? { configured: true, masked: maskSecret(envKey), source: 'worker' }
        : { configured: false }
    }
  }
  const configured = (id: string) => Boolean(inventory.providers[id]?.configured)
  return {
    ok: true,
    service: 'mezze',
    version: '0.4.5',
    authenticated: Boolean(userId),
    jev: configured('typesafe'),
    system2: providers.some((provider) => provider.kind === 'system2' && configured(provider.id)),
    providers: Object.fromEntries(
      Object.entries(inventory.providers).map(([id, value]) => [id, value.configured]),
    ),
    keyCustody: await encryptionCustody(env, env.DB),
  }
}

export async function jevAnswer(env: Env, userId: string, body: Record<string, unknown>): Promise<unknown[]> {
  const key = await getKey(env, userId, 'typesafe')
  if (!key) throw new ApiError(503, 'provider_not_configured', 'Add a TypeSafe key to use the live System 1 lane.', 'typesafe')
  const base = (typeof env.TYPESAFE_BASE_URL === 'string' ? env.TYPESAFE_BASE_URL : 'https://api.typesafe.ai').replace(/\/$/, '')
  const upstream = await fetch(`${base}/v1/answer`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: typeof body.model === 'string' ? body.model : 'jev-1.14.0',
      state: body.state ?? {},
      questions: Array.isArray(body.questions) ? body.questions : [],
    }),
  })
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, MAX_RESPONSE_CHARS)
    throw new ApiError(502, 'jev_upstream', `TypeSafe returned ${upstream.status}.`, detail)
  }
  const payload = (await upstream.json()) as { answers?: unknown }
  return Array.isArray(payload.answers) ? payload.answers : []
}

export interface System2Canvas {
  name: string
  description: string
  html: string
  css: string
  js: string
}

export interface System2Result {
  plan: string[]
  prose: string
  canvas?: System2Canvas
  model: string
  provider: ProviderId
  usage: { promptTokens: number; completionTokens: number; cost: number }
}

export async function system2(env: Env, userId: string, body: Record<string, unknown>): Promise<System2Result> {
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim().slice(0, 160)
      : typeof env.SYSTEM2_MODEL === 'string'
        ? env.SYSTEM2_MODEL
        : S2_DEFAULT
  const provider = providerForModel(model)
  const selectedModel = modelLabel(model)
  const key = await getKey(env, userId, provider)
  if (!key) {
    const definition = providers.find((item) => item.id === provider)
    throw new ApiError(
      503,
      'provider_not_configured',
      `Add a ${definition?.name ?? provider} key to use ${selectedModel}.`,
      provider,
    )
  }
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : []
  const messages = rawMessages
    .filter((message): message is { role: string; content: string } => {
      if (!message || typeof message !== 'object') return false
      const row = message as { role?: unknown; content?: unknown }
      return typeof row.role === 'string' && typeof row.content === 'string'
    })
    .map((message) => ({ role: message.role, content: message.content.slice(0, MAX_MESSAGE_CHARS) }))
  if (!messages.length) throw new ApiError(400, 'empty_messages', 'At least one message is required.')

  const wantsCanvas = body.canvas === true
  if (wantsCanvas) {
    messages.push({
      role: 'system',
      content:
        'Also return "canvas": { name, description, html, css, js }. It must be a complete, self-contained, responsive page using only HTML, CSS and vanilla JS — no external libraries, no storage APIs, no network calls. Make it genuinely interactive.',
    })
  }

  const completion = await complete(env, provider, key, model, messages)
  const parsed = parseStructured(completion.text)
  return {
    ...parsed,
    model: selectedModel,
    provider,
    usage: {
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      cost: Number((completion.promptTokens * 0.000003 + completion.completionTokens * 0.000015).toFixed(5)),
    },
  }
}

async function complete(
  env: Env,
  provider: ProviderId,
  key: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const apiModel = modelForProvider(provider, model)
  if (provider === 'anthropic') {
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
    const conversation = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }))
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: apiModel,
        max_tokens: 4096,
        temperature: 0.2,
        ...(system ? { system } : {}),
        messages: conversation.length ? conversation : [{ role: 'user', content: 'Continue.' }],
      }),
    })
    if (!response.ok) {
      throw upstreamError('Anthropic', response.status, await response.text())
    }
    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    return {
      text: (payload.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n'),
      promptTokens: payload.usage?.input_tokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
      completionTokens: payload.usage?.output_tokens ?? 0,
    }
  }

  if (provider === 'google') {
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(apiModel)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Continue.' }] }],
          // JSON mode is not supported by every AI Studio model (Gemma, image
          // models), so rely on the prompt and lenient parsing instead.
          generationConfig: { temperature: 0.2 },
        }),
      },
    )
    if (!response.ok) {
      throw upstreamError('Google', response.status, await response.text())
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    return {
      text: (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('\n'),
      promptTokens: payload.usageMetadata?.promptTokenCount ?? estimateTokens(messages.map((message) => message.content).join('\n')),
      completionTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
    }
  }

  const base =
    provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : provider === 'groq'
        ? (typeof env.GROQ_BASE_URL === 'string' && env.GROQ_BASE_URL.trim()
            ? env.GROQ_BASE_URL
            : 'https://api.groq.com/openai/v1').replace(/\/$/, '')
        : (typeof env.OPENAI_BASE_URL === 'string'
            ? env.OPENAI_BASE_URL
            : typeof env.SYSTEM2_BASE_URL === 'string'
              ? env.SYSTEM2_BASE_URL
              : 'https://api.openai.com/v1').replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      ...(provider === 'openrouter'
        ? { 'HTTP-Referer': 'https://sosystem.amos-donn.workers.dev', 'X-Title': 'Mezze' }
        : {}),
    },
    body: JSON.stringify({
      model: apiModel,
      messages,
      temperature: 0.2,
      ...(provider === 'openai' ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!response.ok) {
    const upstream = provider === 'openrouter' ? 'OpenRouter' : provider === 'groq' ? 'Groq' : 'OpenAI'
    throw upstreamError(upstream, response.status, await response.text())
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const content = payload.choices?.[0]?.message?.content
  return {
    text: typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('\n'),
    promptTokens: payload.usage?.prompt_tokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
    completionTokens: payload.usage?.completion_tokens ?? 0,
  }
}

function upstreamError(provider: string, status: number, body: string): ApiError {
  return new ApiError(502, 'provider_upstream', `${provider} returned ${status}.`, body.slice(0, MAX_RESPONSE_CHARS))
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

function parseStructured(text: string): { plan: string[]; prose: string; canvas?: System2Canvas } {
  let plan: string[] = []
  let prose = text.trim()
  let canvas: System2Canvas | undefined
  try {
    const trimmed = text.trim()
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
    const parsed = JSON.parse(fenced ? fenced[1] : trimmed) as {
      plan?: unknown
      prose?: unknown
      canvas?: unknown
    }
    if (Array.isArray(parsed.plan)) {
      plan = parsed.plan.filter((step): step is string => typeof step === 'string').slice(0, 12)
    }
    if (typeof parsed.prose === 'string' && parsed.prose.trim()) prose = parsed.prose.trim()
    const raw = parsed.canvas
    if (raw && typeof raw === 'object') {
      const row = raw as Record<string, unknown>
      if (typeof row.html === 'string' && row.html.trim()) {
        canvas = {
          name: (typeof row.name === 'string' ? row.name : 'Canvas').slice(0, 64),
          description: (typeof row.description === 'string' ? row.description : '').slice(0, 300),
          html: row.html.slice(0, 120_000),
          css: (typeof row.css === 'string' ? row.css : '').slice(0, 120_000),
          js: (typeof row.js === 'string' ? row.js : '').slice(0, 120_000),
        }
      }
    }
  } catch {
    // A non-JSON completion is still usable prose.
  }
  return { plan, prose, ...(canvas ? { canvas } : {}) }
}
