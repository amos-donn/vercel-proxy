import type { ProviderId } from '../src/data/providers'

/**
 * Split an SSE buffer into complete `data:` payloads.
 *
 * Chunks from upstream never line up with events, so the caller keeps the
 * returned tail and feeds it back with the next chunk.
 */
export function ssePayloads(buffer: string): { payloads: string[]; rest: string } {
  const payloads: string[] = []
  let rest = buffer
  let newline = rest.indexOf('\n')
  while (newline !== -1) {
    const line = rest.slice(0, newline).trim()
    rest = rest.slice(newline + 1)
    newline = rest.indexOf('\n')
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (payload && payload !== '[DONE]') payloads.push(payload)
  }
  return { payloads, rest }
}

/** The text delta of one parsed upstream event, per provider dialect. */
export function streamDelta(provider: ProviderId, payload: Record<string, unknown>): string {
  if (provider === 'anthropic') {
    if (payload.type !== 'content_block_delta') return ''
    const delta = payload.delta as { text?: unknown } | undefined
    return typeof delta?.text === 'string' ? delta.text : ''
  }

  if (provider === 'google') {
    const candidates = payload.candidates as
      | Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
      | undefined
    const parts = candidates?.[0]?.content?.parts
    return Array.isArray(parts)
      ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
      : ''
  }

  const choices = payload.choices as Array<{ delta?: { content?: unknown } }> | undefined
  const content = choices?.[0]?.delta?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : ''))
      .join('')
  }
  return ''
}
