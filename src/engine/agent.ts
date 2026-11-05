import type { ActionStep, CanvasDraft, CanvasFile, FileDiff, PlanStep } from '../types'
import type { TurnHistoryMessage, TurnSkill, TurnWorkspace, TurnWorkspaceFile } from './runtime'
import { filesToParts, languageOf, mergeCanvasFiles } from './canvasDoc'

/**
 * The agent harness.
 *
 * Modelled on Cline (one tool per message, wait for the result, focus chain,
 * escalating tool errors) and the Hermes function-calling loop (strict JSON
 * envelope, schema checks before execution, observation truncation, a hard
 * iteration cap with a forced final synthesis).
 *
 * Every iteration is one model call that returns exactly one tool call. The
 * tool runs against the real workspace, its output goes back as an observation,
 * and the loop continues until `finish` or the step budget is spent.
 */

const MAX_TURNS = 12
const MAX_OBSERVATION_CHARS = 6_000
const PROMPT_FILE_BUDGET = 12_000
const CALL_TIMEOUT_MS = 90_000

export interface AgentCanvasRef {
  id: string
  name: string
}

export interface AgentContext {
  readFile: (path: string) => TurnWorkspaceFile | undefined
  writeFile: (path: string, text: string) => void
  canvases: Array<AgentCanvasRef & { files: CanvasFile[] }>
  createCanvas: (draft: CanvasDraft) => AgentCanvasRef
  updateCanvas: (id: string, draft: Partial<CanvasDraft>) => AgentCanvasRef
}

export interface AgentToolTrace {
  id: string
  name: string
  title: string
  input?: string
  output?: string
  status: 'running' | 'ok' | 'error'
  ms?: number
  diff?: FileDiff[]
}

export interface AgentHooks {
  onStep: (step: ActionStep) => void
  onTool: (tool: AgentToolTrace) => void
  onThought?: (text: string) => void
  /** Live tokens while the model is still replying, so the chat never looks dead. */
  onDelta?: (text: string) => void
  onPlan?: (steps: PlanStep[]) => void
  context: AgentContext
}

export interface AgentInput {
  goal: string
  model: string
  history: TurnHistoryMessage[]
  workspace: TurnWorkspace
  skills?: TurnSkill[]
  canvasRequested?: boolean
  /** Canvases already in the workspace, so follow-ups update instead of duplicating. */
  canvases?: AgentCanvasRef[]
}

export interface AgentOutcome {
  text: string
  plan: PlanStep[]
  actions: number
  calls: number
  canvasId?: string
}

interface AgentMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface Envelope {
  thought?: string
  focus?: string[]
  tool: string
  args: Record<string, unknown>
}

interface ToolOutcome {
  label: string
  summary?: string
  output: string
  detail?: string
  diff?: FileDiff[]
  canvasId?: string
}

const TOOLS = [
  'list_files',
  'read_file',
  'search_files',
  'write_file',
  'canvas_write',
  'web_search',
  'fetch_url',
  'finish',
] as const

export async function runAgent(input: AgentInput, hooks: AgentHooks): Promise<AgentOutcome> {
  const messages: AgentMessage[] = [
    { role: 'system', content: agentPrompt(input) },
    ...input.history.slice(-8).map((message) => ({ role: message.role, content: message.content.slice(0, 3_000) })),
    { role: 'user', content: input.goal },
  ]

  let plan = startPlan(input.goal)
  hooks.onPlan?.(plan)
  let actions = 0
  let calls = 0
  let canvasId: string | undefined
  let lastSignature = ''
  let repeats = 0

  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const call = track(hooks, `Called ${input.model} · step ${turn}`, {
      input: `${messages.length} messages · ${actions} action${actions === 1 ? '' : 's'} so far`,
    })
    calls += 1

    let text: string
    try {
      text = await askModel(input.model, messages, hooks.onDelta)
    } catch (error) {
      call.fail(messageOf(error))
      throw error
    }

    const envelope = parseEnvelope(text)
    if (!envelope) {
      call.fail('The model replied without a tool call')
      messages.push({ role: 'assistant', content: text.slice(0, 3_000) })
      messages.push({
        role: 'user',
        content:
          '[ERROR] No tool call found in your last message. Reply with exactly one JSON object: {"thought":"...","tool":"<tool name>","args":{...}}. Available tools: ' +
          TOOLS.join(', ') +
          '.',
      })
      continue
    }

    call.done({ output: `${envelope.tool}${envelope.thought ? ` · ${truncate(envelope.thought, 140)}` : ''}` })
    if (envelope.thought) hooks.onThought?.(envelope.thought)
    if (envelope.focus?.length) {
      plan = mergePlan(plan, envelope.focus)
      hooks.onPlan?.(plan)
    }

    if (envelope.tool === 'finish' || envelope.tool === 'attempt_completion') {
      const answer =
        typeof envelope.args.text === 'string'
          ? envelope.args.text
          : typeof envelope.args.summary === 'string'
            ? envelope.args.summary
            : envelope.thought ?? ''
      plan = plan.map((step) => ({ ...step, status: 'done' as const }))
      hooks.onPlan?.(plan)
      return { text: answer.trim(), plan, actions, calls, canvasId }
    }

    const signature = `${envelope.tool}:${stable(envelope.args)}`
    if (signature === lastSignature) {
      repeats += 1
      if (repeats >= 2) {
        messages.push({ role: 'assistant', content: JSON.stringify(envelope) })
        messages.push({
          role: 'user',
          content: '[ERROR] You repeated the same tool call with identical arguments twice. That is not making progress. Read the last result and either try a different tool or call finish.',
        })
        repeats = 0
        continue
      }
    } else {
      repeats = 0
    }
    lastSignature = signature

    const toolMessage: AgentToolTrace = {
      id: `tool_${turn}_${Math.random().toString(36).slice(2, 7)}`,
      name: envelope.tool,
      title: titleFor(envelope.tool, envelope.args),
      input: truncate(JSON.stringify(envelope.args, null, 2), 1_400),
      status: 'running',
    }
    hooks.onTool(toolMessage)
    const startedAt = performance.now()

    try {
      const outcome = await executeTool(envelope.tool, envelope.args, input, hooks.context)
      actions += 1
      if (outcome.canvasId) canvasId = outcome.canvasId
      hooks.onTool({
        ...toolMessage,
        status: 'ok',
        output: truncate(outcome.output, 4_000),
        ms: Math.round(performance.now() - startedAt),
        ...(outcome.diff ? { diff: outcome.diff } : {}),
      })
      const record = track(hooks, outcome.label, outcome.detail ? { detail: outcome.detail } : {})
      record.done({ output: outcome.summary })

      plan = advancePlan(plan)
      hooks.onPlan?.(plan)

      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          thought: envelope.thought,
          tool: envelope.tool,
          args: envelope.args,
        }),
      })
      messages.push({
        role: 'user',
        content: `TOOL RESULT [${envelope.tool}]\n${truncate(outcome.output, MAX_OBSERVATION_CHARS)}\n\nContinue: take the next action, or call finish with the complete answer.`,
      })
    } catch (error) {
      const message = messageOf(error)
      hooks.onTool({
        ...toolMessage,
        status: 'error',
        output: message,
        ms: Math.round(performance.now() - startedAt),
      })
      messages.push({ role: 'assistant', content: JSON.stringify(envelope) })
      messages.push({
        role: 'user',
        content: `TOOL ERROR [${envelope.tool}]: ${message}\nFix the call and retry, or choose another tool. Do not repeat the same failing call.`,
      })
    }
  }

  // Budget spent: never end silently. One forced synthesis turn, tools banned.
  const forced = track(hooks, 'Wrote the final answer from what was gathered')
  try {
    messages.push({
      role: 'user',
      content:
        `You have used all ${MAX_TURNS} actions for this turn. Stop calling tools. Reply with one JSON object: {"tool":"finish","args":{"text":"<complete Markdown answer from the results so far, and say what is unfinished>"}}.`,
    })
    const text = await askModel(input.model, messages, hooks.onDelta)
    const envelope = parseEnvelope(text)
    const answer = envelope?.args?.text
    forced.done({ output: 'Step budget reached' })
    plan = plan.map((step) => ({ ...step, status: 'done' as const }))
    hooks.onPlan?.(plan)
    return {
      text: typeof answer === 'string' && answer.trim() ? answer : text.trim(),
      plan,
      actions,
      calls: calls + 1,
      canvasId,
    }
  } catch (error) {
    forced.fail(messageOf(error))
    throw error
  }
}

/* ------------------------------------------------------------------ *
   Tools — validated before anything runs
 * ------------------------------------------------------------------ */

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  input: AgentInput,
  context: AgentContext,
): Promise<ToolOutcome> {
  switch (name) {
    case 'list_files': {
      const root = typeof args.path === 'string' ? cleanPath(args.path) : ''
      const files = input.workspace.files.filter(
        (file) => !root || file.path === root || file.path.startsWith(`${root.replace(/\/$/, '')}/`),
      )
      const listing = files.length
        ? files.slice(0, 80).map((file) => `${file.path} (${formatBytes(file.bytes)})`).join('\n')
        : 'No files here yet.'
      return {
        label: `Listed ${files.length} workspace file${files.length === 1 ? '' : 's'}`,
        summary: `${files.length} paths`,
        output: listing,
      }
    }

    case 'read_file': {
      const path = cleanPath(String(args.path ?? ''))
      if (!path) throw new Error('read_file needs {"path": "relative/path"}.')
      const file = context.readFile(path)
      if (!file) {
        const near = input.workspace.files.slice(0, 20).map((item) => item.path).join('\n')
        throw new Error(`No file at "${path}". Real paths:\n${near || '(workspace is empty)'}`)
      }
      return {
        label: `Read ${file.path}`,
        summary: `${formatBytes(file.bytes)} · ${(file.text ?? '').split('\n').length} lines`,
        output: `${file.path} (${formatBytes(file.bytes)})\n\n${file.text ?? '(binary or empty file)'}`,
      }
    }

    case 'search_files': {
      const query = String(args.query ?? '').trim().toLowerCase()
      if (!query) throw new Error('search_files needs {"query": "term"}.')
      const hits: string[] = []
      for (const file of input.workspace.files) {
        if (file.path.toLowerCase().includes(query)) hits.push(file.path)
        const text = file.text ?? ''
        if (text) {
          text.split('\n').forEach((line, index) => {
            if (hits.length < 40 && line.toLowerCase().includes(query)) {
              hits.push(`${file.path}:${index + 1}: ${line.trim().slice(0, 160)}`)
            }
          })
        }
        if (hits.length >= 40) break
      }
      return {
        label: `Searched workspace for “${truncate(query, 32)}”`,
        summary: `${hits.length} match${hits.length === 1 ? '' : 'es'}`,
        output: hits.length ? hits.join('\n') : `No match for "${query}".`,
      }
    }

    case 'write_file': {
      const path = cleanPath(String(args.path ?? ''))
      const content = typeof args.content === 'string' ? args.content : ''
      if (!path) throw new Error('write_file needs a relative path, e.g. "drafts/notes.md".')
      if (!content.trim()) throw new Error('write_file needs non-empty "content".')
      const existing = context.readFile(path)
      context.writeFile(path, content)
      const diff = diffFiles(path, existing?.text ?? '', content)
      return {
        label: `Wrote ${path}`,
        summary: `${content.split('\n').length} lines · +${diff.additions} −${diff.deletions}`,
        output: `Wrote ${formatBytes(content.length)} to ${path}.\n\n${preview(content)}`,
        diff: [diff],
      }
    }

    case 'canvas_write': {
      const files = normalizeCanvasFiles(args.files ?? args)
      if (!files.length) {
        throw new Error('canvas_write needs files: [{"path":"index.html","content":"..."}]. index.html is required.')
      }
      if (!files.some((file) => file.language === 'html')) {
        throw new Error('canvas_write needs an HTML entry file (index.html).')
      }
      const requestedId =
        typeof args.canvas_id === 'string' ? args.canvas_id : typeof args.canvasId === 'string' ? args.canvasId : ''
      const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 64) : ''
      const existing = requestedId
        ? context.canvases.find((canvas) => canvas.id === requestedId)
        : name
          ? context.canvases.find((canvas) => canvas.name.toLowerCase() === name.toLowerCase())
          : undefined
      const description = typeof args.description === 'string' ? args.description.slice(0, 300) : ''

      if (existing) {
        const merged = mergeCanvasFiles(existing.files, files)
        const parts = filesToParts(merged)
        const ref = context.updateCanvas(existing.id, {
          name: name || existing.name,
          ...(description ? { description } : {}),
          files: merged,
          ...parts,
        })
        return {
          label: `Updated canvas “${ref.name}” (${merged.length} files)`,
          summary: files.map((file) => file.path).join(', '),
          output: `Canvas ${ref.name} now has ${merged.length} files:\n${merged.map((file) => `- ${file.path} (${formatBytes(file.content.length)})`).join('\n')}`,
          canvasId: ref.id,
        }
      }

      const parts = filesToParts(files)
      const ref = context.createCanvas({
        name: name || 'Canvas',
        description: description || 'Built by the agent in the canvas sandbox.',
        files,
        ...parts,
      })
      return {
        label: `Built canvas “${ref.name}” with ${files.length} files`,
        summary: files.map((file) => file.path).join(', '),
        output: `Created canvas ${ref.name} with:\n${files.map((file) => `- ${file.path} (${formatBytes(file.content.length)})`).join('\n')}\nIt runs immediately in the sandbox.`,
        canvasId: ref.id,
      }
    }

    case 'web_search': {
      const query = String(args.query ?? '').trim()
      if (!query) throw new Error('web_search needs {"query": "what to look up"}.')
      const payload = await webRequest({ action: 'search', query: query.slice(0, 400) })
      const results = Array.isArray(payload.results)
        ? (payload.results as Array<{ title?: unknown; url?: unknown; snippet?: unknown }>)
        : []
      const lines = results.map((row, index) => {
        const title = typeof row.title === 'string' ? row.title : 'Untitled'
        const url = typeof row.url === 'string' ? row.url : ''
        const snippet = typeof row.snippet === 'string' ? row.snippet : ''
        return `${index + 1}. ${title}\n   ${url}${snippet ? `\n   ${snippet}` : ''}`
      })
      return {
        label: `Searched the web for “${truncate(query, 40)}”`,
        summary: `${results.length} result${results.length === 1 ? '' : 's'}`,
        output: lines.length
          ? `${lines.join('\n\n')}\n\nRead a result with fetch_url before citing it.`
          : 'The search returned no results. Try different words.',
      }
    }

    case 'fetch_url': {
      const url = String(args.url ?? '').trim()
      if (!url) throw new Error('fetch_url needs {"url": "https://…"}.')
      const payload = await webRequest({ action: 'read', url })
      const title = typeof payload.title === 'string' ? payload.title : url
      const finalUrl = typeof payload.url === 'string' ? payload.url : url
      const text = typeof payload.text === 'string' ? payload.text : ''
      return {
        label: `Read ${hostOf(finalUrl)}`,
        summary: `${text.length.toLocaleString()} characters`,
        output: `${title}\n${finalUrl}\n\n${text || '(the page had no readable text)'}`,
      }
    }

    default:
      throw new Error(`Unknown tool "${name}". Available tools: ${TOOLS.join(', ')}.`)
  }
}

function titleFor(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read_file':
      return `Read ${String(args.path ?? 'a file')}`
    case 'write_file':
      return `Write ${String(args.path ?? 'a file')}`
    case 'list_files':
      return args.path ? `List ${String(args.path)}` : 'List workspace files'
    case 'search_files':
      return `Search for “${String(args.query ?? '')}”`
    case 'canvas_write':
      return `Build canvas${args.name ? ` “${String(args.name)}”` : ''}`
    case 'web_search':
      return `Search the web for “${String(args.query ?? '')}”`
    case 'fetch_url':
      return `Read ${String(args.url ?? 'a page')}`
    default:
      return name
  }
}

/* ------------------------------------------------------------------ *
   Prompt — the loop contract, workspace and skills
 * ------------------------------------------------------------------ */

function agentPrompt(input: AgentInput): string {
  const lines = [
    'You are Mezze, an autonomous coding agent working inside the user\'s workspace (chats, files, canvases).',
    'You do not answer in one shot. You work in a loop: take ONE action, read its result, then decide the next action — exactly like a coding agent in an IDE.',
    '',
    '## Reply format',
    'Reply with one JSON object and nothing else:',
    '{"thought":"short private reasoning","focus":["verb-first step", "..."],"tool":"<tool>","args":{...}}',
    '`focus` is your live checklist. Send it whenever it changes.',
    '',
    '## Tools',
    '- list_files {"path"?: string}',
    '- read_file {"path": string}',
    '- search_files {"query": string}',
    '- write_file {"path": string, "content": string} — writes immediately to the workspace.',
    '- canvas_write {"name"?: string, "canvas_id"?: string, "files": [{"path": string, "content": string}]} — creates or updates a canvas. index.html is required; styles.css, app.js and any other files are inlined automatically.',
    '- web_search {"query": string} — live web search; returns titles, URLs and snippets.',
    '- fetch_url {"url": string} — read a web page as text (http/https only).',
    '- finish {"text": string} — end the turn; text is the complete Markdown answer.',
    '',
    '## Rules',
    '1. One tool per message. Never call two tools at once. Wait for TOOL RESULT.',
    '2. Never claim an action you did not take. If you need a file, read it.',
    '3. Keep focus items atomic and verb-first ("Read the queue log", "Write the retry fix").',
    '4. Inspect before editing. After a write, read or search the result if you need to verify it.',
    '5. If a tool returns TOOL ERROR, fix the call. Do not repeat the same failing call.',
    '6. `thought` is private reasoning; the user sees `finish.text` plus every tool you ran.',
    '7. Everything you write stays inside the workspace. Never invent paths.',
    '8. Research means real sources: web_search, then fetch_url on at least two results, then cite their URLs in finish.text. Never present memory as if it came from a search.',
    '',
    '## Worked example',
    'User: "make a flappy bird game in canvas"',
    '{"thought":"I should look at what already exists before building.","focus":["Inspect the workspace","Build the game canvas","Verify the script wiring"],"tool":"list_files","args":{}}',
    'TOOL RESULT [list_files] …',
    '{"thought":"Nothing relevant. I will build a three-file canvas with the game loop in app.js.","focus":["Inspect the workspace","Build the game canvas","Verify the script wiring"],"tool":"canvas_write","args":{"name":"Flappy Bird","files":[{"path":"index.html","content":"…"},{"path":"styles.css","content":"…"},{"path":"app.js","content":"…"}]}}',
    'TOOL RESULT [canvas_write] …',
    '{"tool":"finish","args":{"text":"Built **Flappy Bird** as a three-file canvas: …"}}',
  ]

  lines.push(
    '',
    '## Internet',
    'You have live internet access through web_search and fetch_url. Use it whenever a fact could be current, when the user asks you to research, or when you are unsure: search, read the strongest two results, and cite the URLs you actually opened. If web_search reports it is not configured, say so plainly in finish.text and offer to read a URL the user supplies.',
  )

  const files = input.workspace.files
  lines.push('', '## Workspace')
  if (input.workspace.roots.length) lines.push(`Roots: ${input.workspace.roots.join(', ')}`)
  if (files.length) {
    lines.push(`Files (${files.length} · ${formatBytes(input.workspace.totalBytes)}):`)
    for (const file of files.slice(0, 40)) lines.push(`- ${file.path} (${formatBytes(file.bytes)})`)
    if (files.length > 40) lines.push(`- …and ${files.length - 40} more`)
    let budget = PROMPT_FILE_BUDGET
    const withText = files.filter((file) => file.text?.trim())
    if (withText.length) {
      lines.push('', 'Contents already in context (use read_file for the rest):')
      for (const file of withText) {
        if (budget <= 0) break
        const body = (file.text ?? '').slice(0, Math.min(3_000, budget))
        budget -= body.length
        lines.push(`### ${file.path}`, body)
      }
    }
  } else {
    lines.push('The workspace is empty. Create the first files yourself.')
  }

  if (input.canvases?.length) {
    lines.push('', '## Canvases already in this workspace', 'Pass canvas_id to canvas_write to update one instead of creating a duplicate:')
    for (const canvas of input.canvases.slice(0, 12)) lines.push(`- ${canvas.name} · canvas_id "${canvas.id}"`)
  }
  if (input.canvasRequested) {
    lines.push(
      '',
      '## Canvas',
      'This turn is canvas-focused. Build the page with canvas_write, in multiple files (index.html, styles.css, app.js). It must be genuinely interactive: real event handlers, working controls, no dead buttons, no external libraries.',
    )
  }
  if (input.skills?.length) {
    lines.push('', '## Skills')
    for (const skill of input.skills) lines.push(`### ${skill.name}`, skill.prompt)
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
   Model transport
 * ------------------------------------------------------------------ */

const STREAM_IDLE_MS = 60_000
const STREAM_TOTAL_MS = 180_000

/**
 * Ask the model for one envelope, streaming its tokens as they arrive.
 * Falls back to a single request when the Worker has no stream route.
 */
async function askModel(
  model: string,
  messages: AgentMessage[],
  onDelta?: (text: string) => void,
): Promise<string> {
  if (!onDelta) return askModelOnce(model, messages)

  const controller = new AbortController()
  let idle = setTimeout(() => controller.abort(), STREAM_IDLE_MS)
  const hard = setTimeout(() => controller.abort(), STREAM_TOTAL_MS)
  const resetIdle = () => {
    clearTimeout(idle)
    idle = setTimeout(() => controller.abort(), STREAM_IDLE_MS)
  }

  try {
    const response = await fetch('/api/system2/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model, raw: true, messages }),
    })
    // An older Worker without the stream route still answers, just without tokens.
    if (response.status === 404 || response.status === 405) return await askModelOnce(model, messages)
    if (!response.ok) throw new Error(await failureMessage(response))
    const reader = response.body?.getReader()
    if (!reader) return await askModelOnce(model, messages)

    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let failed = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let event: { type?: unknown; text?: unknown; message?: unknown }
        try {
          event = JSON.parse(payload) as typeof event
        } catch {
          continue
        }
        if (event.type === 'delta' && typeof event.text === 'string') {
          text += event.text
          onDelta(text)
        } else if (event.type === 'error') {
          failed = typeof event.message === 'string' ? event.message : 'The model stream failed.'
        }
      }
    }
    if (failed) throw new Error(failed)
    if (!text.trim()) return await askModelOnce(model, messages)
    return text
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`The model sent no tokens for ${STREAM_IDLE_MS / 1000}s. The turn was stopped.`)
    }
    throw error
  } finally {
    clearTimeout(idle)
    clearTimeout(hard)
  }
}

async function failureMessage(response: Response): Promise<string> {
  let message = `The model call failed (${response.status}).`
  try {
    const body = (await response.json()) as { message?: unknown; detail?: unknown }
    if (typeof body.message === 'string' && body.message.trim()) {
      message =
        typeof body.detail === 'string' && body.detail.trim()
          ? `${body.message.trim()} ${body.detail.trim().slice(0, 300)}`
          : body.message.trim()
    }
  } catch {
    // Non-JSON errors keep the fallback.
  }
  return message
}

async function askModelOnce(model: string, messages: AgentMessage[]): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
  try {
    const response = await fetch('/api/system2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model, raw: true, messages }),
    })
    if (!response.ok) throw new Error(await failureMessage(response))
    const body = (await response.json()) as { prose?: unknown; text?: unknown }
    const text = typeof body.text === 'string' ? body.text : typeof body.prose === 'string' ? body.prose : ''
    if (!text.trim()) throw new Error('The model returned an empty reply.')
    return text
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`The model did not answer within ${CALL_TIMEOUT_MS / 1000}s. No further actions were taken.`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
   Parsing and normalisation
 * ------------------------------------------------------------------ */

function parseEnvelope(text: string): Envelope | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1])
  for (const candidate of [...fenced, text]) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) continue
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1))
      const envelope = envelopeOf(parsed)
      if (envelope) return envelope
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function envelopeOf(raw: unknown): Envelope | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const tool =
    typeof row.tool === 'string' ? row.tool : typeof row.action === 'string' ? row.action : typeof row.name === 'string' ? row.name : ''
  const candidate = row.args ?? row.parameters ?? row.input
  const args =
    candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : row.arguments && typeof row.arguments === 'object' && !Array.isArray(row.arguments)
        ? (row.arguments as Record<string, unknown>)
        : {}
  if (!tool.trim()) {
    // A bare finish object ({"text": "..."}) is accepted as the final answer.
    if (typeof row.text === 'string' && row.text.trim()) return { tool: 'finish', args: { text: row.text } }
    return null
  }
  const thought = typeof row.thought === 'string' ? row.thought.trim() : ''
  const focus = Array.isArray(row.focus)
    ? row.focus.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 10)
    : undefined
  return {
    tool: tool.trim(),
    args,
    ...(thought ? { thought } : {}),
    ...(focus?.length ? { focus } : {}),
  }
}

function normalizeCanvasFiles(raw: unknown): CanvasFile[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const path = typeof row.path === 'string' ? row.path : typeof row.name === 'string' ? row.name : ''
      const content = typeof row.content === 'string' ? row.content : typeof row.text === 'string' ? row.text : ''
      if (!path.trim() || !content.trim()) return []
      const clean = cleanPath(path)
      if (!clean) return []
      return [{ path: clean, language: languageOf(clean), content: content.slice(0, 120_000) }]
    })
  }
  const row = (raw ?? {}) as Record<string, unknown>
  const files: CanvasFile[] = []
  if (typeof row.html === 'string' && row.html.trim()) {
    files.push({ path: 'index.html', language: 'html', content: row.html })
  }
  if (typeof row.css === 'string' && row.css.trim()) {
    files.push({ path: 'styles.css', language: 'css', content: row.css })
  }
  if (typeof row.js === 'string' && row.js.trim()) {
    files.push({ path: 'app.js', language: 'js', content: row.js })
  }
  return files
}

/* ------------------------------------------------------------------ *
   Plan / focus chain
 * ------------------------------------------------------------------ */

function startPlan(goal: string): PlanStep[] {
  return [{ id: 'p1', label: `Understand “${truncate(goal, 44)}”`, status: 'active' }]
}

function mergePlan(plan: PlanStep[], labels: string[]): PlanStep[] {
  const next: PlanStep[] = labels.map((label, index) => {
    const existing = plan.find((step) => step.label.toLowerCase() === label.toLowerCase())
    return {
      id: existing?.id ?? `p${index + 1}`,
      label,
      status: existing?.status ?? 'pending',
    }
  })
  if (!next.some((step) => step.status === 'active')) {
    const first = next.find((step) => step.status === 'pending')
    if (first) first.status = 'active'
  }
  return next
}

function advancePlan(plan: PlanStep[]): PlanStep[] {
  const activeIndex = plan.findIndex((step) => step.status === 'active')
  if (activeIndex === -1) return plan
  const next = plan.map((step, index) => (index === activeIndex ? { ...step, status: 'done' as const } : step))
  const pendingIndex = next.findIndex((step) => step.status === 'pending')
  if (pendingIndex !== -1) next[pendingIndex] = { ...next[pendingIndex], status: 'active' }
  return next
}

/* ------------------------------------------------------------------ *
   Diffs, paths, formatting
 * ------------------------------------------------------------------ */

function diffFiles(path: string, before: string, after: string): FileDiff {
  const beforeLines = before ? before.split('\n') : []
  const afterLines = after.split('\n')
  if (beforeLines.length > 400 || afterLines.length > 400) {
    return {
      file: path,
      additions: afterLines.length,
      deletions: beforeLines.length,
      lines: afterLines.slice(0, 60).map((text) => ({ t: 'add' as const, text })),
    }
  }
  const table: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    new Array<number>(afterLines.length + 1).fill(0),
  )
  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        beforeLines[i] === afterLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const lines: FileDiff['lines'] = []
  let additions = 0
  let deletions = 0
  let i = 0
  let j = 0
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ t: 'ctx', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ t: 'del', text: beforeLines[i] })
      deletions += 1
      i += 1
    } else {
      lines.push({ t: 'add', text: afterLines[j] })
      additions += 1
      j += 1
    }
  }
  while (i < beforeLines.length) {
    lines.push({ t: 'del', text: beforeLines[i] })
    deletions += 1
    i += 1
  }
  while (j < afterLines.length) {
    lines.push({ t: 'add', text: afterLines[j] })
    additions += 1
    j += 1
  }
  return { file: path, additions, deletions, lines: lines.slice(0, 400) }
}

function cleanPath(value: string): string {
  const path = value.trim().replace(/^\/+/, '')
  if (!path || path.includes('..') || /^[a-z]+:\/\//i.test(path)) return ''
  return path.slice(0, 200)
}

function stable(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function webRequest(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch('/api/web', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      let message = `The web request failed (${response.status}).`
      try {
        const body = (await response.json()) as { message?: unknown; detail?: unknown }
        if (typeof body.message === 'string' && body.message.trim()) {
          message =
            typeof body.detail === 'string' && body.detail.trim()
              ? `${body.message.trim()} ${body.detail.trim().slice(0, 200)}`
              : body.message.trim()
        }
      } catch {
        // Non-JSON errors keep the fallback.
      }
      throw new Error(message)
    }
    return (await response.json()) as Record<string, unknown>
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The web request took too long and was cancelled.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function preview(content: string): string {
  return content.split('\n').slice(0, 12).join('\n') + (content.split('\n').length > 12 ? '\n…' : '')
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${bytes} B`
}

function track(hooks: AgentHooks, label: string, extra: { detail?: string; input?: string } = {}) {
  const id = `agent_step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const startedAt = performance.now()
  hooks.onStep({ id, label, status: 'running', ...extra })
  return {
    id,
    done(patch: { output?: string; detail?: string } = {}) {
      hooks.onStep({ id, label, status: 'done', ...extra, ...patch, ms: Math.round(performance.now() - startedAt) })
    },
    fail(message: string) {
      hooks.onStep({ id, label, status: 'error', output: message, ...extra, ms: Math.round(performance.now() - startedAt) })
    },
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The action failed.'
}
