import type { Env } from './db'
import { ApiError } from './errors'

/**
 * Internet tools for the agent.
 *
 * Both run inside the Worker: the browser never fetches arbitrary URLs, and the
 * search key never leaves the server. Reading is restricted to public http(s)
 * hosts, bounded in size, and stripped to text.
 */

const MAX_TEXT = 12_000
const MAX_RAW = 400_000
const SEARCH_TIMEOUT_MS = 20_000
const READ_TIMEOUT_MS = 15_000

export interface WebResult {
  title: string
  url: string
  snippet: string
}

export async function webSearch(env: Env, query: string): Promise<WebResult[]> {
  const key = typeof env.EXA_API_KEY === 'string' ? env.EXA_API_KEY.trim() : ''
  if (!key) {
    throw new ApiError(
      503,
      'web_search_not_configured',
      'Web search is not configured. Set EXA_API_KEY on the Worker to let the agent search; reading a known URL still works.',
    )
  }

  let response: Response
  try {
    response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      body: JSON.stringify({
        query: query.slice(0, 400),
        numResults: 6,
        type: 'auto',
        contents: { text: { maxCharacters: 600 } },
      }),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ApiError(504, 'web_search_timeout', 'The search provider did not answer in time.')
    }
    throw new ApiError(502, 'web_search_unreachable', 'The search provider could not be reached.')
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new ApiError(502, 'web_search_failed', `The search provider returned ${response.status}.`, detail)
  }

  const payload = (await response.json()) as {
    results?: Array<{ title?: unknown; url?: unknown; text?: unknown }>
  }
  return (payload.results ?? [])
    .flatMap((row) => {
      if (typeof row.url !== 'string' || !row.url.trim()) return []
      return [
        {
          title: typeof row.title === 'string' && row.title.trim() ? row.title.trim().slice(0, 200) : row.url,
          url: row.url,
          snippet: typeof row.text === 'string' ? row.text.replace(/\s+/g, ' ').trim().slice(0, 400) : '',
        },
      ]
    })
    .slice(0, 8)
}

export async function readPage(rawUrl: string): Promise<{ url: string; title: string; text: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ApiError(400, 'bad_url', 'That is not a valid URL.')
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new ApiError(400, 'bad_url', 'Only http and https URLs can be read.')
  }
  if (isPrivateHost(url.hostname)) {
    throw new ApiError(400, 'private_url', 'That host is not reachable from the Worker.')
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'MezzeResearch/1.0 (+https://sosystem.amos-donn.workers.dev)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ApiError(504, 'read_timeout', 'That page did not respond in time.')
    }
    throw new ApiError(502, 'read_unreachable', 'That page could not be reached.')
  }

  // A redirect can land on a private address, so re-check the final URL.
  try {
    if (isPrivateHost(new URL(response.url).hostname)) {
      throw new ApiError(400, 'private_url', 'That host is not reachable from the Worker.')
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
  }

  if (!response.ok) {
    throw new ApiError(502, 'read_failed', `That page returned ${response.status}.`)
  }

  const type = response.headers.get('content-type') ?? ''
  const raw = (await response.text()).slice(0, MAX_RAW)
  const isHtml = /html|xml/i.test(type) || /<html[\s>]/i.test(raw.slice(0, 2_000))
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : response.url
  const text = isHtml ? htmlToText(raw) : raw.trim()

  return {
    url: response.url,
    title: title || response.url,
    text: text.slice(0, MAX_TEXT),
  }
}

function htmlToText(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|header|footer|li|h[1-6]|tr|pre|blockquote|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return decodeEntities(cleaned)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    hellip: '…',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
  }
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => safeChar(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match)
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** Block loopback, link-local and RFC1918 targets so the Worker cannot probe internals. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return true
  }
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true
  if (host === 'metadata.google.internal') return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!ipv4) return false
  const a = Number(ipv4[1])
  const b = Number(ipv4[2])
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}
