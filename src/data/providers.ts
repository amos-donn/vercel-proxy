import type { Provider, Tone } from '../types'

export type ProviderId = 'typesafe' | 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter'

/** Providers whose full model list can be fetched from their API. */
export type LiveCatalogProvider = 'openrouter' | 'google' | 'groq'

export const liveCatalogProviders: LiveCatalogProvider[] = ['openrouter', 'google', 'groq']

export const isLiveCatalogProvider = (value: string): value is LiveCatalogProvider =>
  (liveCatalogProviders as string[]).includes(value)

export interface ProviderDefinition {
  id: ProviderId
  name: string
  mark: string
  keyName: string
  envNames: string[]
  note: string
  models: number
  tone: Tone
  defaultModel: string
  kind: 'system1' | 'system2'
}

export const providers: ProviderDefinition[] = [
  {
    id: 'typesafe',
    name: 'TypeSafe AI',
    mark: 'J',
    keyName: 'TYPESAFE_API_KEY',
    envNames: ['TYPESAFE_API_KEY'],
    note: 'Jev · System 1 typed decisions',
    models: 2,
    tone: 'violet',
    defaultModel: 'jev-1.14.0',
    kind: 'system1',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    mark: 'A',
    keyName: 'ANTHROPIC_API_KEY',
    envNames: ['ANTHROPIC_API_KEY'],
    note: 'Claude Opus 5 · Sonnet 5 · Haiku 4.5',
    models: 3,
    tone: 'amber',
    defaultModel: 'claude-sonnet-5',
    kind: 'system2',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    mark: 'O',
    keyName: 'OPENAI_API_KEY',
    envNames: ['OPENAI_API_KEY', 'SYSTEM2_API_KEY'],
    note: 'GPT-5.2 · GPT-5 mini',
    models: 2,
    tone: 'lime',
    defaultModel: 'gpt-5.2',
    kind: 'system2',
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    mark: 'G',
    keyName: 'GEMINI_API_KEY',
    envNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    note: 'Gemini, Gemma and every AI Studio chat model',
    models: 60,
    tone: 'blue',
    defaultModel: 'gemini-3-pro',
    kind: 'system2',
  },
  {
    id: 'groq',
    name: 'Groq',
    mark: 'Q',
    keyName: 'GROQ_API_KEY',
    envNames: ['GROQ_API_KEY'],
    note: 'Llama · Qwen · GPT-OSS at low latency',
    models: 25,
    tone: 'red',
    defaultModel: 'groq:llama-3.3-70b-versatile',
    kind: 'system2',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    mark: 'R',
    keyName: 'OPENROUTER_API_KEY',
    envNames: ['OPENROUTER_API_KEY'],
    note: 'Long-tail models behind one key',
    models: 450,
    tone: 'violet',
    defaultModel: 'openai/gpt-5.2',
    kind: 'system2',
  },
]

export const providerById = (id: string): ProviderDefinition | undefined =>
  providers.find((provider) => provider.id === id)

export const providerByKeyName = (name: string): ProviderDefinition | undefined =>
  providers.find((provider) => provider.keyName === name)

/** Catalog ids are provider-qualified when their native ids are ambiguous. */
export function modelLabel(model: string): string {
  return model.replace(/^(google|groq):/i, '')
}

/** Strip a catalog qualifier before calling the provider's API. */
export function modelForProvider(provider: ProviderId, model: string): string {
  if (provider === 'google' && model.toLowerCase().startsWith('google:')) return model.slice(7)
  if (provider === 'groq' && model.toLowerCase().startsWith('groq:')) return model.slice(5)
  return model
}

export function providerForModel(model: string): ProviderId {
  const value = model.toLowerCase()
  if (value.startsWith('groq:')) return 'groq'
  if (value.startsWith('google:')) return 'google'
  if (value.includes('/')) return 'openrouter'
  if (value.startsWith('claude')) return 'anthropic'
  if (value.startsWith('gemini') || value.startsWith('gemma') || value.startsWith('learnlm')) return 'google'
  if (value.startsWith('gpt') || value.startsWith('o1') || value.startsWith('o3')) return 'openai'
  return 'openai'
}

export function emptyProviders(): Provider[] {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    mark: provider.mark,
    status: 'missing',
    models: provider.models,
    note: provider.note,
    tone: provider.tone,
  }))
}
