import type { PlanStep } from '../types'

/**
 * System 2 owns planning and prose. Contract:
 *  - plan is returned as data (steps), not parsed out of markdown
 *  - prose streams after the plan is accepted
 *  - every claim that needs a source gets one, or the draft says it is unverified
 */

export interface System2Input {
  goal: string
  files: string[]
  evidence: string[]
  template?: string
}

export interface System2Result {
  plan: PlanStep[]
  prose: string
  artifact?: { name: string; type: string; meta: string; content: string }
  latencyMs: number
  costUsd: number
}

export function system2Body(input: System2Input, model: string) {
  return {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are System 2 in a dual-process agent. Return JSON: { plan: string[], prose: string, artifact?: { name, type, content } }. Plan is 3-5 steps. Cite file paths for claims. If a fact is not in the evidence, say it is unverified.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ],
  }
}

const text = (goal: string) => goal.toLowerCase()

export function planSteps(goal: string): PlanStep[] {
  const kind = classify(goal)
  const labels = {
    write: ['Gather the source material', 'Group into themes', 'Draft with links', 'Flag what is unverified'],
    transcribe: ['Probe and chunk the media', 'Transcribe chunks', 'Merge timestamps', 'Write chapters and quotes'],
    job: ['Read attempt history', 'Find the policy gap', 'Propose a scoped fix', 'Replay safely'],
    research: ['Map what is already known', 'Read the strongest sources', 'Compare and decide', 'Write the summary'],
  }[kind]
  return labels.map((label, i) => ({
    id: `p${i + 1}`,
    label,
    status: i === 0 ? 'done' : i === 1 ? 'active' : 'pending',
  }))
}

export function simulateSystem2(input: System2Input): System2Result {
  const kind = classify(input.goal)
  const started = performance.now()
  const latency = kind === 'write' ? 4_180 : 3_240
  return {
    plan: planSteps(input.goal),
    prose: proseFor(kind, input),
    artifact: artifactFor(kind, input),
    latencyMs: latency,
    costUsd: kind === 'write' ? 0.041 : 0.028,
    ...(started > 0 ? {} : {}),
  }
}

function classify(goal: string): 'write' | 'transcribe' | 'job' | 'research' {
  const value = text(goal)
  if (/transcri|video|audio|interview|podcast/.test(value)) return 'transcribe'
  if (/job|queue|rate|retry|dead.?letter|429|backoff/.test(value)) return 'job'
  if (/write|draft|note|release|report|summar|plan/.test(value)) return 'write'
  return 'research'
}

function proseFor(kind: 'write' | 'transcribe' | 'job' | 'research', input: System2Input): string {
  if (kind === 'transcribe') {
    return 'The four chunks are queued and the first is running. I will merge timestamps on quiet cuts so no word lands twice, then write chapters and pull the three quotes that actually support the harness argument.\n\nGemini is rate limited right now, so the job pauses with a visible countdown rather than spinning. Nothing needs you until the transcript is ready.'
  }
  if (kind === 'job') {
    return 'The export died because the queue treats Stripe concurrency as a per-second rate limit. Backoff cannot free a semaphore slot, so attempts 1 through 5 all re-entered the same full pool.\n\nTwo changes: a real per-provider semaphore in `jobs/queue.ts`, and two export shards instead of three. Replay `job_801` with its original idempotency key because attempt 3 timed out without a provider request id.\n\nIf you only do one thing, add the semaphore. The shard count is an optimisation.'
  }
  if (kind === 'write') {
    return 'Drafted four themes with links to every source: plan clarity, annual billing, invoice correctness, and dunning. I left the migration note marked unverified rather than asserting the nullable column in production.\n\nThe strongest line is the one about annual proration, because it changes what a customer is billed mid-cycle. The dunning fix is worth naming explicitly since it caused duplicate email complaints.'
  }
  return `I read ${input.files.length} workspace file${input.files.length === 1 ? '' : 's'} and pulled the parts that answer the question. The short version: the evidence supports the first claim, partially supports the second, and says nothing about the third.\n\nI would not publish the third without a source. Everything else is ready in the draft.`
}

function artifactFor(kind: string, input: System2Input): System2Result['artifact'] {
  if (kind === 'transcribe') {
    return {
      name: 'founder-interview-chapters.md',
      type: 'Markdown',
      meta: '8 chapters · 3 quotes · timestamps',
      content:
        '# Founder interview — chapters\n\n## 00:04 Why a browser agent\n## 00:41 The harness is permissions and recovery\n## 02:02 Typed decisions changed the economics\n## 02:45 Reflex for choices, deliberation for prose\n\n## Quotes\n> "Typed decisions changed the economics more than a bigger model did." — 02:02\n',
    }
  }
  if (kind === 'job') {
    return {
      name: 'plans/queue-fix.md',
      type: 'Plan',
      meta: '3 changes · 1 replay · idempotency preserved',
      content:
        '# Queue fix\n\n1. Add a semaphore keyed by provider + endpoint.\n2. Split the usage export into two shards.\n3. Replay job_801 with the original idempotency key.\n\nDo not change the retry budget: 5 attempts is correct once concurrency is fixed.\n',
    }
  }
  if (kind === 'write') {
    return {
      name: 'drafts/v0.4-notes.md',
      type: 'Markdown',
      meta: '42 lines · 18 links · 1 open question',
      content:
        '# v0.4 — Billing\n\nFour themes: plan clarity, annual billing, invoice correctness, dunning.\n\n## Plan clarity\nTeam is retired for new accounts; existing workspaces keep their price until renewal. ([#118](https://github.com/amos-donn/billing-console/pull/118))\n\n## Annual billing\nAnnual plans prorate to the day. ([#121](https://github.com/amos-donn/billing-console/pull/121))\n\n## Open question\n`plan_id` may be null for grandfathered accounts — unverified.\n',
    }
  }
  return {
    name: `reports/${slug(input.goal)}.md`,
    type: 'Report',
    meta: 'Summary · sources · open questions',
    content: `# ${input.goal.slice(0, 80)}\n\n${input.evidence.join('\n\n') || 'No evidence collected.'}\n`,
  }
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'report'
  )
}
