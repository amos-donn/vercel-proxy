/**
 * sosystem worker.
 *
 * Serves the built SPA plus three routes:
 *   /api/health  — which lanes are configured (booleans only)
 *   /api/jev     — server-side proxy for Jev, System 1
 *   /api/system2 — OpenAI-compatible proxy for the heavy lane
 *
 * Keys never reach the browser. Both proxies are same-origin and
 * unauthenticated in this pass; accounts land with storage.
 */

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  SYSTEM2_API_KEY?: string
  SYSTEM2_BASE_URL?: string
  SYSTEM2_MODEL?: string
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const MAX_BODY = 64 * 1024

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > MAX_BODY) throw new Error('body_too_large')
  const parsed = JSON.parse(text || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_body')
  return parsed as Record<string, unknown>
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'sosystem',
        version: '0.2.0',
        jev: Boolean(env.TYPESAFE_API_KEY),
        system2: Boolean(env.SYSTEM2_API_KEY),
        now: Date.now(),
      })
    }

    if (url.pathname === '/api/jev') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      if (!env.TYPESAFE_API_KEY) {
        return json({ error: 'not_configured', detail: 'TYPESAFE_API_KEY is not set' }, 503)
      }
      try {
        const body = await readBody(request)
        const base = (env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai').replace(/\/$/, '')
        const upstream = await fetch(`${base}/v1/answer`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
          },
          body: JSON.stringify({
            model: typeof body.model === 'string' ? body.model : 'jev-1.14.0',
            state: body.state ?? {},
            questions: Array.isArray(body.questions) ? body.questions : [],
          }),
        })
        if (!upstream.ok) {
          return json({ error: 'jev_upstream', status: upstream.status }, 502)
        }
        const payload = (await upstream.json()) as { answers?: unknown }
        return json({ answers: Array.isArray(payload.answers) ? payload.answers : [] })
      } catch (error) {
        return json(
          { error: 'jev_failed', detail: error instanceof Error ? error.message : 'unknown' },
          400,
        )
      }
    }

    if (url.pathname === '/api/system2') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      if (!env.SYSTEM2_API_KEY) {
        return json({ error: 'not_configured', detail: 'SYSTEM2_API_KEY is not set' }, 503)
      }
      try {
        const body = await readBody(request)
        const base = (env.SYSTEM2_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
        const model = typeof body.model === 'string' ? body.model : env.SYSTEM2_MODEL ?? 'gpt-5.2'
        const messages = Array.isArray(body.messages) ? body.messages : []
        const upstream = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.SYSTEM2_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            response_format: { type: 'json_object' },
          }),
        })
        if (!upstream.ok) {
          const detail = await upstream.text()
          return json({ error: 'system2_upstream', status: upstream.status, detail: detail.slice(0, 400) }, 502)
        }
        const payload = (await upstream.json()) as {
          choices?: Array<{ message?: { content?: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        const content = payload.choices?.[0]?.message?.content ?? ''
        let plan: string[] = []
        let prose = content
        try {
          const parsed = JSON.parse(content) as { plan?: unknown; prose?: unknown }
          if (Array.isArray(parsed.plan)) plan = parsed.plan.filter((step): step is string => typeof step === 'string')
          if (typeof parsed.prose === 'string') prose = parsed.prose
        } catch {
          // A non-JSON completion is still usable prose.
        }
        const promptTokens = payload.usage?.prompt_tokens ?? 0
        const completionTokens = payload.usage?.completion_tokens ?? 0
        return json({
          plan,
          prose,
          model,
          usage: {
            promptTokens,
            completionTokens,
            cost: Number((promptTokens * 0.000003 + completionTokens * 0.000015).toFixed(5)),
          },
        })
      } catch (error) {
        return json(
          { error: 'system2_failed', detail: error instanceof Error ? error.message : 'unknown' },
          400,
        )
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404)
    }

    return env.ASSETS.fetch(request)
  },
}
