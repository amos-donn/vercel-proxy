import type { Answer, DecisionTrace, PlanStep, Thresholds } from '../types'
import {
  buildStepRequest,
  choiceOf,
  confidenceOf,
  makeTrace,
  planFor,
  probabilityOf,
  route,
  simulateAnswers,
  templateReply,
  type SimInput,
} from './jev'
import { planSteps, simulateSystem2 } from './system2'

export interface TurnTool {
  name: string
  title: string
  input?: string
  output?: string
  ms?: number
}

export interface TurnApproval {
  title: string
  detail: string
  scope: string[]
  risk: 'low' | 'medium' | 'high'
  action: 'write' | 'delete'
  fileName: string
}

export interface TurnResult {
  trace: DecisionTrace
  tools: TurnTool[]
  approval?: TurnApproval
  plan?: PlanStep[]
  assistant: { system: 's1' | 's2'; text: string; template?: boolean }
  artifact?: { name: string; type: string; meta: string; content?: string; target?: 'files' | 'media' }
  job?: { title: string; provider: string; kind: 'transcribe' | 'sync' | 'crawl' | 'export'; detail: string; mediaId?: string }
  media?: { name: string; kind: 'video' | 'audio'; durationSec: number; sizeMb: number }
  notice?: string
  live: boolean
  error?: string
}

export interface TurnInput {
  goal: string
  files: string[]
  fileCount: number
  runningJobs: number
  forceSystem2: boolean
  thresholds: Thresholds
  s2Model: string
  runtime: 'simulated' | 'live'
}

const decide = (input: TurnInput) => {
  const sim: SimInput = {
    goal: input.goal,
    files: input.files,
    runningJobs: input.runningJobs,
    forceSystem2: input.forceSystem2,
  }
  return simulateAnswers(sim)
}

export async function executeTurn(input: TurnInput): Promise<TurnResult> {
  if (input.runtime === 'live') {
    try {
      return await liveTurn(input)
    } catch (error) {
      const fallback = simulatedTurn(input)
      fallback.error = error instanceof Error ? error.message : 'Live runtime unavailable'
      fallback.notice = 'Live runtime unavailable — this turn ran in simulation.'
      return fallback
    }
  }
  return simulatedTurn(input)
}

function simulatedTurn(input: TurnInput): TurnResult {
  const sim = decide(input)
  const answers = sim.answers
  const decision = sim.decision
  const signal = route(answers, input.thresholds)
  const latency = decision === 'transcribe' ? 197 : decision === 'inspect_job' ? 242 : decision === 'respond' ? 228 : 284

  const tools: TurnTool[] = []

  if (decision === 'search_files') {
    const terms = input.goal.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 4)
    const matches = input.files.filter((path) => terms.some((term) => path.includes(term))).slice(0, 5)
    tools.push({
      name: 'files.search',
      title: `Searched ${input.fileCount} files`,
      input: `terms=${terms.slice(0, 4).join(', ') || 'goal'}`,
      output: matches.length ? `${matches.length} matches\n\n${matches.join('\n')}` : 'No path matched. Falling back to content search.',
      ms: 620,
    })
  }

  if (decision === 'inspect_job') {
    tools.push({
      name: 'jobs.inspect',
      title: 'Read the latest attempt log',
      input: 'provider=Stripe · state=dead_letter',
      output:
        'attempt 1  429 endpoint-concurrency\nattempt 2  429 endpoint-concurrency\nattempt 3  timeout (no request id)\nattempt 4  429 endpoint-concurrency\nattempt 5  429 endpoint-concurrency\nbackoff cap 30s · jitter applied · replay key preserved',
      ms: 480,
    })
  }

  if (decision === 'transcribe') {
    const name = /interview/i.test(input.goal)
      ? 'founder-interview.mp4'
      : /audio|call|podcast/i.test(input.goal)
        ? 'customer-call.m4a'
        : 'design-review-q4.mov'
    tools.push({
      name: 'media.transcribe',
      title: 'Queued chunks with retry/backoff',
      input: `${name} · 16 kHz mono · 10s overlap`,
      output: 'job queued · 4 chunks · provider Gemini · resumes automatically on 429',
      ms: 380,
    })
  }

  const escalation =
    signal.route === 's2'
      ? {
          reason: signal.reason,
          threshold: signal.threshold,
          signal: signal.signal,
          s2: {
            model: input.s2Model,
            latencyMs: decision === 'write_file' ? 4_180 : 3_240,
            costUsd: decision === 'write_file' ? 0.041 : 0.028,
            plan: planFor(input.goal).map((step) => step.label),
          },
        }
      : undefined

  const trace = makeTrace({
    answers,
    decision,
    latencyMs: latency,
    promptTokens: sim.promptTokens,
    route: signal,
    s2: escalation,
    template: decision === 'respond' ? templateReply({ goal: input.goal, files: input.files, runningJobs: input.runningJobs, forceSystem2: false }) : undefined,
  })

  // System 1 can only answer from templates or fixed slots. Anything that
  // needs composed prose goes to System 2, even when routing accepted S1.
  const needsProse = decision !== 'respond' && decision !== 'search_files'
  if (signal.route === 's1' && needsProse) {
    trace.route = 's2'
    trace.escalation = {
      reason: 'System 1 selected a tool, but the reply needs composed prose',
      threshold: 0.1,
      signal: 0.83,
      s2: { model: input.s2Model, latencyMs: 3_180, costUsd: 0.031, plan: planFor(input.goal).map((step) => step.label) },
    }
    trace.savedUsd = trace.s1.costUsd + 0.031 - trace.baselineUsd
  }

  const s2 = simulateSystem2({ goal: input.goal, files: input.files, evidence: tools.map((tool) => tool.output ?? '') })

  if (trace.route === 's2') {
    trace.escalation = trace.escalation ?? {
      reason: signal.reason,
      threshold: signal.threshold,
      signal: signal.signal,
      s2: { model: input.s2Model, latencyMs: s2.latencyMs, costUsd: s2.costUsd, plan: s2.plan.map((step) => step.label) },
    }
    trace.escalation.s2.costUsd = s2.costUsd
    trace.escalation.s2.latencyMs = s2.latencyMs
    trace.savedUsd = trace.s1.costUsd + s2.costUsd - trace.baselineUsd
  }

  if (decision === 'write_file') {
    const fileName = /queue|job|retry/.test(input.goal) ? 'plans/queue-fix.md' : /release|note|billing/.test(input.goal) ? 'drafts/v0.4-notes.md' : 'reports/' + input.goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) + '.md'
    return {
      trace,
      tools,
      plan: planFor(input.goal),
      approval: {
        title: `Write ${fileName}`,
        detail: 'Creates the file inside the workspace vault. It is not published, pushed, or shared.',
        scope: [`write: ${fileName}`],
        risk: 'low',
        action: 'write',
        fileName,
      },
      assistant: { system: 's2', text: s2.prose },
      artifact: { name: fileName.split('/').pop() ?? fileName, type: 'Markdown', meta: 'draft · review before publish', content: s2.artifact?.content },
      live: false,
    }
  }

  if (decision === 'transcribe') {
    return {
      trace,
      tools,
      plan: planFor(input.goal),
      assistant: { system: 's2', text: s2.prose },
      job: { title: 'Transcribe founder-interview.mp4', provider: 'Gemini', kind: 'transcribe', detail: '4 chunks · 28m source · 16 kHz mono', mediaId: 'med_1' },
      media: { name: 'founder-interview.mp4', kind: 'video', durationSec: 1_694, sizeMb: 184 },
      live: false,
    }
  }

  if (decision === 'respond') {
    return {
      trace,
      tools,
      assistant: { system: 's1', text: templateReply({ goal: input.goal, files: input.files, runningJobs: input.runningJobs, forceSystem2: false }), template: true },
      live: false,
    }
  }

  return {
    trace,
    tools,
    plan: planSteps(input.goal),
    assistant: { system: 's2', text: s2.prose },
    artifact: s2.artifact ? { ...s2.artifact, target: 'files' } : undefined,
    live: false,
  }
}

/* ------------------------------------------------------------------ *
   Live path — Worker proxies; keys never reach the browser
 * ------------------------------------------------------------------ */

async function liveTurn(input: TurnInput): Promise<TurnResult> {
  const request = buildStepRequest({
    goal: input.goal,
    files: input.files,
    plan: [],
    history: [],
    runningJobs: input.runningJobs,
    totalFiles: input.fileCount,
  })

  const response = await fetch('/api/jev', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`Jev ${response.status}`)
  const payload = (await response.json()) as { answers?: unknown }
  const answers = (payload.answers ?? []) as Answer[]
  if (!answers.length) throw new Error('Jev returned no answers')

  const decision = choiceOf(answers, 'next', 'escalate')
  const confidence = confidenceOf(answers, 'next')
  const needs = probabilityOf(answers, 'needs_system_2')
  const signal = route(answers, input.thresholds)

  let prose = ''
  let plan: PlanStep[] = []
  let cost = 0.03
  if (signal.route === 's2' || needs >= input.thresholds.escalate) {
    const completion = await fetch('/api/system2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.s2Model,
        messages: [
          { role: 'system', content: 'You are System 2. Return JSON { plan: string[], prose: string }.' },
          { role: 'user', content: input.goal },
        ],
      }),
    })
    if (!completion.ok) throw new Error(`System 2 ${completion.status}`)
    const body = (await completion.json()) as { plan?: string[]; prose?: string; usage?: { cost?: number } }
    prose = body.prose ?? ''
    plan = (body.plan ?? []).map((label, i) => ({ id: `p${i}`, label, status: i === 0 ? 'done' : 'pending' }))
    cost = body.usage?.cost ?? cost
  }

  const trace = makeTrace({
    answers,
    decision,
    latencyMs: 220,
    promptTokens: 6_000,
    route: signal,
    s2: signal.route === 's2' ? { reason: signal.reason, threshold: signal.threshold, signal: signal.signal, s2: { model: input.s2Model, latencyMs: 3_000, costUsd: cost, plan: plan.map((p) => p.label) } } : undefined,
  })

  return {
    trace,
    tools: [],
    plan: plan.length ? plan : undefined,
    assistant: { system: trace.route === 's2' ? 's2' : 's1', text: prose || 'Live decision accepted.' },
    live: true,
    notice: `Live runtime · confidence ${confidence.toFixed(2)} · decision ${decision}`,
  }
}
