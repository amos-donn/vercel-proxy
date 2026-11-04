import type { Provider, Tone } from '../types'

export type ProviderId = 'typesafe' | 'anthropic' | 'openai' | 'google' | 'openrouter'

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
    name: 'Google',
    mark: 'G',
    keyName: 'GEMINI_API_KEY',
    envNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    note: 'Gemini 3 Pro · Flash',
    models: 2,
    tone: 'blue',
    defaultModel: 'gemini-3-pro',
    kind: 'system2',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    mark: 'R',
    keyName: 'OPENROUTER_API_KEY',
    envNames: ['OPENROUTER_API_KEY'],
    note: 'Long-tail models behind one key',
    models: 140,
    tone: 'violet',
    defaultModel: 'openai/gpt-5.2',
    kind: 'system2',
  },
]

export const providerById = (id: string): ProviderDefinition | undefined =>
  providers.find((provider) => provider.id === id)

export const providerByKeyName = (name: string): ProviderDefinition | undefined =>
  providers.find((provider) => provider.keyName === name)

export function providerForModel(model: string): ProviderId {
  const value = model.toLowerCase()
  if (value.startsWith('claude')) return 'anthropic'
  if (value.startsWith('gemini')) return 'google'
  if (value.includes('/')) return 'openrouter'
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
