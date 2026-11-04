import type { Answer, DecisionTrace, JevRequest, PlanStep, Thresholds } from '../types'

/**
 * Jev (TypeSafe AI) is System 1: it never writes prose. It answers typed
 * questions over a state, and the code decides what the answer means.
 *
 * Request shape verified against docs/typesafe.ai: { model, state, questions },
 * answers echo { choice, probabilities, confidence } / { score } / { value }.
 */

export const JEV_MODEL = 'jev-1.14.0'
export const JEV_QUESTIONS = 5

export interface TurnState {
  goal: string
  files: string[]
  plan: string[]
  history: string[]
  runningJobs: number
  totalFiles: number
}

export const ACTIONS = [
  'respond',
  'search_files',
  'read_file',
  'write_file',
  'transcribe',
  'inspect_job',
  'escalate',
] as const

export type Action = (typeof ACTIONS)[number]

export function buildStepRequest(state: TurnState): JevRequest {
  const targets = state.files.slice(0, 12).map((path) => ({ id: path, description: path.split('/')[0] }))
  return {
    model: JEV_MODEL,
    state: {
      goal: state.goal,
      plan: state.plan,
      history: state.history.slice(-6),
      files: state.files.slice(0, 12),
      file_count: state.totalFiles,
      running_jobs: state.runningJobs,
    },
    questions: [
      {
        id: 'next',
        kind: 'choice',
        prompt: 'What is the next move for this turn?',
        options: [
          { id: 'respond', description: 'Answer from a template or a known slot.' },
          { id: 'search_files', description: 'Search the workspace by path or content.' },
          { id: 'read_file', description: 'Read a specific file before deciding.' },
          { id: 'write_file', description: 'Create or update a workspace file.' },
          { id: 'transcribe', description: 'Queue media for transcription.' },
          { id: 'inspect_job', description: 'Inspect a queued or failed job.' },
          { id: 'escalate', description: 'Hand the turn to System 2.' },
        ],
      },
      {
        id: 'target_file',
        kind: 'choice',
        prompt: 'Which file is most relevant?',
        options: targets.length ? targets : [{ id: 'none', description: 'No file' }],
      },
      {
        id: 'needs_system_2',
        kind: 'noul',
        statement:
          'This turn requires planning, judgement, or composed prose that cannot be selected from a fixed option.',
      },
      {
        id: 'action_is_risky',
        kind: 'noul',
        statement: 'The next action writes, deletes, sends, publishes, or spends money.',
      },
      {
        id: 'on_track',
        kind: 'noul',
        statement: 'The previous action moved toward the stated goal.',
      },
    ],
  }
}

/** Validate a response before it can reach the action layer. */
export function parseAnswers(raw: unknown): Answer[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is Answer => {
    if (!item || typeof item !== 'object') return false
    const answer = item as Answer
    return typeof answer.id === 'string'
  })
}

export function probabilityOf(answers: Answer[], id: string, fallback = 0): number {
  const answer = answers.find((item) => item.id === id)
  if (!answer) return fallback
  if (typeof answer.value === 'number') return answer.value
  if (typeof answer.noul === 'number') return answer.noul
  return fallback
}

export function choiceOf(answers: Answer[], id: string, fallback: string): string {
  return answers.find((item) => item.id === id)?.choice ?? fallback
}

export function confidenceOf(answers: Answer[], id: string): number {
  const answer = answers.find((item) => item.id === id)
  if (!answer) return 0
  return answer.confidence ?? (answer.probabilities ? Math.max(...Object.values(answer.probabilities)) : 0)
}

export interface RouteDecision {
  route: 's1' | 's2'
  reason: string
  signal: number
  threshold: number
}

export function route(answers: Answer[], thresholds: Thresholds): RouteDecision {
  const needs = probabilityOf(answers, 'needs_system_2')
  const confidence = confidenceOf(answers, 'next')
  const risky = probabilityOf(answers, 'action_is_risky')
  const kind = choiceOf(answers, 'next', 'escalate')

  if (needs >= thresholds.escalate) {
    return {
      route: 's2',
      reason: `needs_system_2 ${needs.toFixed(2)} ≥ ${thresholds.escalate.toFixed(2)}`,
      signal: needs,
      threshold: thresholds.escalate,
    }
  }
  if (confidence < thresholds.accept) {
    return {
      route: 's2',
      reason: `confidence ${confidence.toFixed(2)} < ${thresholds.accept.toFixed(2)}`,
      signal: confidence,
      threshold: thresholds.accept,
    }
  }
  if (kind === 'escalate') {
    return { route: 's2', reason: 'System 1 chose escalation', signal: confidence, threshold: thresholds.accept }
  }
  if (kind === 'write_file' && risky >= thresholds.risky) {
    return {
      route: 's1',
      reason: `write is gated (risk ${risky.toFixed(2)} ≥ ${thresholds.risky.toFixed(2)})`,
      signal: risky,
      threshold: thresholds.risky,
    }
  }
  return { route: 's1', reason: `confidence ${confidence.toFixed(2)} ≥ ${thresholds.accept.toFixed(2)}`, signal: confidence, threshold: thresholds.accept }
}

/** Cost/latency baseline for the same turn handled entirely by System 2. */
export const S2_BASELINE_USD = 0.041
export const S2_OUTPUT_USD = 0.038
export const S1_COST_USD = 0.0003
export const S1_BASE_MS = 240

export function makeTrace(args: {
  answers: Answer[]
  decision: string
  latencyMs: number
  promptTokens: number
  route: RouteDecision
  s2?: DecisionTrace['escalation']
  template?: string
}): DecisionTrace {
  const next = args.answers.find((item) => item.id === 'next')
  const probabilities = next?.probabilities ?? { [args.decision]: next?.confidence ?? 0.8 }
  const confidence = next?.confidence ?? probabilities[args.decision] ?? 0.8
  const id = `tr_${Math.random().toString(36).slice(2, 9)}`
  const saved = args.route.route === 's1' ? S2_BASELINE_USD - S1_COST_USD : S1_COST_USD + (args.s2?.s2.costUsd ?? S2_OUTPUT_USD) - S2_BASELINE_USD
  return {
    id,
    route: args.route.route,
    s1: {
      model: JEV_MODEL,
      version: JEV_MODEL,
      latencyMs: args.latencyMs,
      costUsd: S1_COST_USD,
      promptTokens: args.promptTokens,
      questions: JEV_QUESTIONS,
      decision: args.decision,
      confidence,
      probabilities,
      validation: 'ok',
      template: args.template,
    },
    escalation: args.s2,
    baselineUsd: S2_BASELINE_USD,
    savedUsd: saved,
  }
}

/* ------------------------------------------------------------------ *
   Deterministic simulation of the typed answers
 * ------------------------------------------------------------------ */

export interface SimInput {
  goal: string
  files: string[]
  runningJobs: number
  forceSystem2: boolean
}

export function simulateAnswers(input: SimInput): { answers: Answer[]; decision: Action; promptTokens: number } {
  const text = input.goal.toLowerCase()
  const running = input.runningJobs
  const simple = /^(hi|hello|hey|thanks|status|what.s running|help)\b/.test(text.trim())
  const media = /transcri|video|audio|interview|podcast/.test(text)
  const job = /job|queue|rate limit|429|retry|dead.?letter|backoff/.test(text)
  const files = /file|read|open|search|find|draft|note|report|summar|release|write|plan|audit/.test(text)
  const targeted = files && input.files.length > 0

  let decision: Action = 'escalate'
  if (simple) decision = 'respond'
  else if (media) decision = 'transcribe'
  else if (job) decision = 'inspect_job'
  else if (targeted) decision = /write|draft|plan/.test(text) ? 'write_file' : 'search_files'

  const needs = input.forceSystem2 || decision === 'escalate' || decision === 'write_file' ? 0.83 : simple ? 0.08 : 0.34
  const risky = decision === 'write_file' ? 0.88 : 0.04
  const confidence =
    decision === 'transcribe' ? 0.97 : decision === 'inspect_job' ? 0.94 : decision === 'search_files' ? 0.86 : decision === 'write_file' ? 0.81 : decision === 'respond' ? 0.93 : 0.72

  const choices = ['respond', 'search_files', 'read_file', 'write_file', 'transcribe', 'inspect_job', 'escalate']
  const probabilities: Record<string, number> = {}
  let remaining = 1 - confidence
  for (const action of choices) {
    if (action === decision) {
      probabilities[action] = confidence
      continue
    }
    const share = action === 'escalate' ? 0.55 : 0.45 / (choices.length - 2)
    probabilities[action] = Number((remaining * share).toFixed(3))
  }
  probabilities.escalate = Number((probabilities.escalate ?? 0).toFixed(3))

  return {
    answers: [
      { id: 'next', choice: decision, confidence, probabilities },
      { id: 'target_file', choice: input.files[0] ?? 'none', confidence: 0.74, probabilities: {} },
      { id: 'needs_system_2', value: Number(needs.toFixed(2)) },
      { id: 'action_is_risky', value: Number(risky.toFixed(2)) },
      { id: 'on_track', value: running > 0 ? 0.9 : 0.97 },
    ],
    decision,
    promptTokens: 4_800 + input.files.length * 180 + Math.round(input.goal.length * 3.5),
  }
}

export function templateReply(input: SimInput): string {
  const text = input.goal.toLowerCase()
  if (/status|running/.test(text)) {
    return input.runningJobs
      ? `${input.runningJobs} job${input.runningJobs === 1 ? '' : 's'} running, nothing waiting on you right now.`
      : 'Nothing is running and nothing is waiting on you.'
  }
  if (/help/.test(text)) return 'Ask for a file, a search, a job, a transcription, or a draft. Anything that needs writing goes to System 2.'
  if (/hi|hello|hey/.test(text)) return 'Here. What are we running?'
  return 'On it.'
}

export function planFor(goal: string): PlanStep[] {
  const text = goal.toLowerCase()
  if (/transcri|video|audio|interview/.test(text)) {
    return [
      { id: 's1', label: 'Queue media and probe duration', status: 'done' },
      { id: 's2', label: 'Chunk at quiet cuts', status: 'done' },
      { id: 's3', label: 'Transcribe chunks with retry/backoff', status: 'active' },
      { id: 's4', label: 'Merge timestamps and write chapters', status: 'pending' },
    ]
  }
  if (/job|queue|rate|retry/.test(text)) {
    return [
      { id: 's1', label: 'Read the job attempt log', status: 'done' },
      { id: 's2', label: 'Separate rate limit from concurrency', status: 'done' },
      { id: 's3', label: 'Propose the queue fix', status: 'active' },
      { id: 's4', label: 'Replay with the original idempotency key', status: 'pending' },
    ]
  }
  if (/write|draft|note|release|report/.test(text)) {
    return [
      { id: 's1', label: 'Gather the source material', status: 'done' },
      { id: 's2', label: 'Group into themes', status: 'done' },
      { id: 's3', label: 'Draft and link the evidence', status: 'active' },
      { id: 's4', label: 'Flag anything unverified', status: 'pending' },
    ]
  }
  return [
    { id: 's1', label: 'Orient in the workspace', status: 'done' },
    { id: 's2', label: 'Decide the smallest next step', status: 'done' },
    { id: 's3', label: 'Do the work and check the result', status: 'active' },
    { id: 's4', label: 'Report and hand back artifacts', status: 'pending' },
  ]
}
