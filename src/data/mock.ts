import type {
  Agent,
  AuditEvent,
  Automation,
  Chat,
  Integration,
  Job,
  Lane,
  MediaItem,
  Provider,
  Quota,
  Secret,
  Settings,
  WorkspaceFile,
} from '../types'

const now = Date.now()
const min = 60_000
const hour = 60 * min

/* ------------------------------------------------------------------ *
   Files
 * ------------------------------------------------------------------ */

const file = (path: string, text: string, origin: 'agent' | 'user' = 'agent'): WorkspaceFile => ({
  path,
  text,
  bytes: new TextEncoder().encode(text).length,
  updated: origin === 'user' ? 'yesterday' : 'just now',
  origin,
})

export const files: WorkspaceFile[] = [
  file(
    'memory.md',
    `# Workspace memory

Index only. One line per topic; details live in memory/<topic>.md.

- [[projects]] — billing-console, sosystem, webagent
- [[preferences]] — terse replies, no em dashes, diff before prose
- [[people]] — Amos (owner), Priya (design), Sam (infra)
- [[decisions]] — dual-process loop, BYOK only, D1 after UI sign-off
`,
  ),
  file(
    'memory/projects.md',
    `# Projects

## billing-console
TypeScript, Next.js on Vercel, Stripe billing. 2,140 files. Test command: \`npm run test:billing\`.

## sosystem
Agent workspace on Cloudflare Workers. Dual-process loop: Jev decides, Sonnet writes.
UI ships before D1; no accounts yet.

## webagent
Chrome MV3 side panel. Browser control, journals, macros. Not part of sosystem.
`,
  ),
  file(
    'memory/decisions.md',
    `# Decisions

- 2026-11-02 · Dual-process loop. Jev is System 1 and never writes prose; System 2 is invoked for ambiguity or any text that must be composed.
- 2026-11-02 · BYOK is mandatory. Provider keys are encrypted at rest; plaintext never returns to the client.
- 2026-11-04 · Superapp shell: chats, files, vault, jobs, media, automations, integrations.
- 2026-11-04 · Accounts and storage are explicitly out of scope for this pass.
`,
  ),
  file(
    'plans/billing-release.md',
    `# Plan: v0.4 billing release notes

- [x] Pull merged PRs since v0.3.0
- [x] Group by theme, skip chores
- [x] Link every PR
- [ ] Verify whether plan_id is nullable in prod
- [ ] Publish to docs/changelog
`,
  ),
  file(
    'reports/billing-weekly.md',
    `# Billing: this week

## Plan changes
- New Scale tier replaces Team for seats above 25 (#118)
- Annual billing is now prorated to the day (#121)

## Fixes
- Invoice PDFs respect the account locale (#116)
- Dunning emails no longer fire twice on retry (#123)

## Migration note
\`plan_id\` may be null for grandfathered accounts. Confirm against production before documenting.
`,
  ),
  file(
    'drafts/v0.4-notes.md',
    `# v0.4 — Billing

Four themes this release: plan clarity, annual billing, invoice correctness, and dunning.

## Plan clarity
The Team tier is retired for new accounts. Existing workspaces keep their price until renewal.
([#118](https://github.com/amos-donn/billing-console/pull/118))

## Annual billing
Annual plans prorate to the day, so an upgrade mid-cycle bills the difference, not a full month.
([#121](https://github.com/amos-donn/billing-console/pull/121))
`,
  ),
  file(
    'data/competitor-scan.csv',
    `vendor,plan,seats,price_usd,annual_discount,source
Linear,Standard,unlimited,8,20%,pricing page
Notion,Plus,unlimited,10,20%,pricing page
Height,Starter,10,7,17%,pricing page
ClickUp,Unlimited,unlimited,7,17%,pricing page
`,
  ),
  file(
    'runs/run_4412.md',
    `# Run 4412 · Port billing settings

- System 1 decisions: 14 (13 accepted, 1 escalated)
- System 2 calls: 1 (plan + prose)
- Tools: repo.search, fs.read, fs.apply_patch, shell.exec
- Approval: patch + test (approved once)
- Outcome: PR #128
`,
  ),
  file(
    'transcripts/founder-interview.md',
    `# Founder interview · 28:14

[00:04] We started with a browser agent because that is where the work was.
[00:41] The lesson was that a harness is mostly permissions and recovery.
[01:18] Typed decisions changed the economics more than a bigger model did.
[02:02] System 2 should write, not decide where to click.
`,
  ),
]

/* ------------------------------------------------------------------ *
   Secrets
 * ------------------------------------------------------------------ */

export const secrets: Secret[] = [
  {
    id: 'sec_1',
    key: 'GITHUB_TOKEN',
    value: 'demo_github_token_not_real_7f2a',
    scope: ['Forge', 'Sentinel'],
    visibility: 'masked',
    updated: '2d ago',
    lastUsed: '12m ago',
  },
  {
    id: 'sec_2',
    key: 'GEMINI_API_KEY',
    value: 'demo_gemini_key_not_real_51cd',
    scope: ['Courier', 'Media jobs'],
    visibility: 'masked',
    updated: '9d ago',
    lastUsed: '1h ago',
  },
  {
    id: 'sec_3',
    key: 'TYPESAFE_API_KEY',
    value: 'demo_typesafe_key_not_real_0eJ4',
    scope: ['System 1'],
    visibility: 'restricted',
    updated: '1d ago',
    lastUsed: 'just now',
  },
  {
    id: 'sec_4',
    key: 'STRIPE_TEST_KEY',
    value: 'demo_stripe_key_not_real_91cd',
    scope: ['Forge'],
    visibility: 'masked',
    updated: '18d ago',
    lastUsed: '4d ago',
  },
]

export const audit: AuditEvent[] = [
  { id: 'a1', action: 'injected', key: 'TYPESAFE_API_KEY', actor: 'Worker · /api/jev', at: 'just now', outcome: 'ok' },
  { id: 'a2', action: 'injected', key: 'GEMINI_API_KEY', actor: 'Job · gemini-transcribe', at: '1h ago', outcome: 'ok' },
  { id: 'a3', action: 'revealed', key: 'GITHUB_TOKEN', actor: 'amos-donn', at: '3h ago', outcome: 'ok' },
  { id: 'a4', action: 'denied', key: 'STRIPE_TEST_KEY', actor: 'Courier', at: 'yesterday', outcome: 'denied' },
  { id: 'a5', action: 'replaced', key: 'TYPESAFE_API_KEY', actor: 'amos-donn', at: '1d ago', outcome: 'ok' },
]

/* ------------------------------------------------------------------ *
   Jobs & quotas
   ------------------------------------------------------------------ */

export const quotas: Quota[] = [
  { id: 'q1', provider: 'Gemini', metric: 'RPM', used: 12, limit: 15, resets: 'in 18s' },
  { id: 'q2', provider: 'Gemini', metric: 'TPM', used: 412_000, limit: 1_000_000, resets: 'in 42s' },
  { id: 'q3', provider: 'GitHub', metric: 'RPM', used: 2_100, limit: 5_000, resets: 'in 31m' },
  { id: 'q4', provider: 'Gemini', metric: 'concurrency', used: 2, limit: 8, resets: 'live' },
]

export const jobs: Job[] = [
  {
    id: 'job_812',
    title: 'Transcribe founder-interview.mp4',
    provider: 'Gemini',
    kind: 'transcribe',
    state: 'paused_rate',
    attempt: 2,
    maxAttempts: 5,
    resumeAt: now + 24_000,
    reason: 'Gemini: 12 of 15 requests/min used. Retry-After honoured.',
    costUsd: 0.004,
    createdAt: '2m ago',
    detail: '4 chunks · 28m source · 16 kHz mono',
    attempts: [
      { n: 1, at: '2m ago', status: 'rate_limited', code: 'RESOURCE_EXHAUSTED', retryAfterMs: 2100, backoffMs: 2000, jitterMs: 640 },
      { n: 2, at: '1m ago', status: 'rate_limited', code: 'RESOURCE_EXHAUSTED', retryAfterMs: 5400, backoffMs: 4000, jitterMs: -820 },
    ],
    mediaId: 'med_1',
  },
  {
    id: 'job_811',
    title: 'Sync Linear issues to workspace',
    provider: 'Linear',
    kind: 'sync',
    state: 'succeeded',
    attempt: 1,
    maxAttempts: 3,
    costUsd: 0,
    createdAt: '18m ago',
    detail: '184 issues · 12 projects · read-only',
    attempts: [{ n: 1, at: '18m ago', status: 'ok', ms: 1840 }],
  },
  {
    id: 'job_809',
    title: 'Publish v0.4 notes to docs',
    provider: 'GitHub',
    kind: 'export',
    state: 'awaiting_approval',
    attempt: 1,
    maxAttempts: 3,
    costUsd: 0,
    createdAt: '41m ago',
    detail: 'docs/changelog/v0.4.md · branch docs/v0.4',
    attempts: [{ n: 1, at: '41m ago', status: 'ok', ms: 900 }],
    chatId: 'chat_release',
  },
  {
    id: 'job_807',
    title: 'Crawl 12 competitor pricing pages',
    provider: 'Browserbase',
    kind: 'crawl',
    state: 'running',
    attempt: 1,
    maxAttempts: 4,
    costUsd: 0.012,
    createdAt: '6m ago',
    detail: '7 of 12 pages · 2 sessions · egress allowlist',
    progress: 58,
    attempts: [{ n: 1, at: '6m ago', status: 'ok', ms: 4200 }],
  },
  {
    id: 'job_801',
    title: 'Export Q3 usage ledger',
    provider: 'Stripe',
    kind: 'export',
    state: 'dead_letter',
    attempt: 5,
    maxAttempts: 5,
    costUsd: 0,
    createdAt: 'yesterday',
    reason: 'Stripe: 429 endpoint-concurrency after 5 attempts',
    detail: 'Retry budget exhausted · idempotency key preserved',
    attempts: [
      { n: 1, at: '5h ago', status: 'rate_limited', code: 'endpoint-concurrency', backoffMs: 2000, jitterMs: 400 },
      { n: 2, at: '5h ago', status: 'rate_limited', code: 'endpoint-concurrency', backoffMs: 4000, jitterMs: -600 },
      { n: 3, at: '4h ago', status: 'timeout', backoffMs: 8000, jitterMs: 1200 },
      { n: 4, at: '4h ago', status: 'rate_limited', code: 'endpoint-concurrency', backoffMs: 16000, jitterMs: 900 },
      { n: 5, at: '3h ago', status: 'rate_limited', code: 'endpoint-concurrency', backoffMs: 30000, jitterMs: -2000 },
    ],
  },
]

/* ------------------------------------------------------------------ *
   Media
   ------------------------------------------------------------------ */

const lines = (
  entries: Array<[number, number, string, string?]>,
): MediaItem['transcript'] =>
  entries.map(([startMs, endMs, text, speaker], i) => ({
    id: `line_${i}`,
    startMs,
    endMs,
    text,
    speaker,
  }))

export const media: MediaItem[] = [
  {
    id: 'med_1',
    name: 'founder-interview.mp4',
    kind: 'video',
    durationSec: 1694,
    sizeMb: 184,
    status: 'transcribed',
    tone: 'violet',
    uploadedAt: '2h ago',
    expiresAt: now + 31 * hour,
    summary:
      'The founder walks through why the browser agent was the starting point, how permissions and recovery became the real product, and why typed decisions changed the economics more than a larger model.',
    transcript: lines([
      [4_000, 24_000, 'We started with a browser agent because that is where the work was.', 'Amos'],
      [41_000, 68_000, 'The lesson was that a harness is mostly permissions and recovery. The model is a small part of it.', 'Amos'],
      [78_000, 96_000, 'Nobody wants another chat box. They want the thing to be done when they come back.', 'Amos'],
      [118_000, 131_000, 'Typed decisions changed the economics more than a bigger model did.', 'Amos'],
      [132_000, 149_000, 'If a small model can pick the next move with a confidence you trust, you stop paying frontier prices for navigation.', 'Amos'],
      [162_000, 188_000, 'But it cannot write the paragraph. That is still the heavy model, and that is fine.', 'Amos'],
      [204_000, 229_000, 'The UX has to show which system acted. If a fast answer is wrong and nothing says it was fast, you lose trust in all of it.', 'Amos'],
      [245_000, 271_000, 'So: reflex for choices, deliberation for prose, and an approval gate anywhere the consequence is real.', 'Amos'],
    ]),
  },
  {
    id: 'med_2',
    name: 'design-review-q4.mov',
    kind: 'video',
    durationSec: 742,
    sizeMb: 96,
    status: 'transcribing',
    tone: 'blue',
    uploadedAt: '14m ago',
    transcript: [],
  },
  {
    id: 'med_3',
    name: 'customer-call-acme.m4a',
    kind: 'audio',
    durationSec: 1288,
    sizeMb: 31,
    status: 'ready',
    tone: 'lime',
    uploadedAt: 'yesterday',
    transcript: [],
  },
  {
    id: 'med_4',
    name: 'launch-teaser.mp4',
    kind: 'video',
    durationSec: 48,
    sizeMb: 22,
    status: 'transcribed',
    tone: 'amber',
    uploadedAt: '3d ago',
    transcript: lines([
      [0, 6_000, 'One workspace. Your keys. Agents that show the plan.', 'Narration'],
      [7_000, 15_000, 'Reflex for the next move. Deliberation for the words.', 'Narration'],
      [16_000, 28_000, 'Files, vault, jobs, media. All of it in one place.', 'Narration'],
    ]),
  },
]

/* ------------------------------------------------------------------ *
   Automations
   ------------------------------------------------------------------ */

export const automations: Automation[] = [
  {
    id: 'auto_1',
    name: 'Weekly release notes',
    prompt: 'Draft release notes from merged PRs since the last tag. Group by theme, skip chores.',
    everyMinutes: 10_080,
    nextAt: now + 3 * 24 * hour,
    runs: 6,
    enabled: true,
    lastRun: '4d ago',
  },
  {
    id: 'auto_2',
    name: 'Inbox triage',
    prompt: 'Scan unread mail for anything that needs a reply today and draft the short ones.',
    everyMinutes: 60,
    nextAt: now + 42 * min,
    runs: 128,
    enabled: true,
    lastRun: '18m ago',
  },
  {
    id: 'auto_3',
    name: 'Competitor pricing watch',
    prompt: 'Check competitor pricing pages, diff against data/competitor-scan.csv, report changes.',
    everyMinutes: 1440,
    nextAt: now + 9 * hour,
    runs: 22,
    enabled: false,
    lastRun: '2d ago',
  },
]

/* ------------------------------------------------------------------ *
   Integrations
   ------------------------------------------------------------------ */

export const integrations: Integration[] = [
  {
    id: 'int_github',
    name: 'GitHub',
    category: 'Code',
    blurb: 'Issues, pull requests, checks and releases for the connected repos.',
    transport: 'streamable-http',
    status: 'connected',
    scopes: ['repo:read', 'pull_request:write', 'checks:read'],
    tools: 24,
    agents: 3,
    verified: true,
  },
  {
    id: 'int_linear',
    name: 'Linear',
    category: 'Planning',
    blurb: 'Issues and projects. Read plus comments, no state changes without approval.',
    transport: 'streamable-http',
    status: 'connected',
    scopes: ['issues:read', 'comments:write'],
    tools: 11,
    agents: 2,
    verified: true,
  },
  {
    id: 'int_slack',
    name: 'Slack',
    category: 'Messaging',
    blurb: 'Post run summaries, answer mentions, and gate approvals in a thread.',
    transport: 'sse',
    status: 'needs_auth',
    scopes: ['chat:write', 'channels:read'],
    tools: 9,
    agents: 1,
  },
  {
    id: 'int_postgres',
    name: 'Postgres',
    category: 'Data',
    blurb: 'Read replica for schema questions and ad-hoc analysis.',
    transport: 'streamable-http',
    status: 'degraded',
    scopes: ['read:analytics'],
    tools: 7,
    agents: 1,
    verified: true,
  },
  {
    id: 'int_notion',
    name: 'Notion',
    category: 'Docs',
    blurb: 'Search workspace docs and append to the release changelog.',
    transport: 'streamable-http',
    status: 'available',
    scopes: ['search:read', 'pages:write'],
    tools: 14,
    agents: 0,
  },
  {
    id: 'int_browserbase',
    name: 'Browserbase',
    category: 'Browser',
    blurb: 'Remote browsers with a live view and session recordings for jobs.',
    transport: 'streamable-http',
    status: 'connected',
    scopes: ['sessions:write'],
    tools: 6,
    agents: 1,
  },
]

/* ------------------------------------------------------------------ *
   Agents, providers, lanes
   ------------------------------------------------------------------ */

export const agents: Agent[] = [
  {
    id: 'forge',
    name: 'Forge',
    role: 'Implementation',
    blurb: 'Reflex handles navigation and file reads; System 2 writes and patches. Stops on the third same-cause failure.',
    tone: 'lime',
    model: 'claude-sonnet-5',
    effort: 'medium',
    posture: 'risky',
    tools: ['files.read', 'files.write', 'shell.exec', 'git.pr', 'jobs.create'],
    questions: 5,
    runs: 341,
    success: 89,
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Research',
    blurb: 'Reads before it writes. Typed relevance decisions, one System 2 synthesis at the end.',
    tone: 'blue',
    model: 'claude-opus-5',
    effort: 'high',
    posture: 'auto',
    tools: ['files.read', 'web.fetch', 'browser', 'media.transcribe'],
    questions: 6,
    runs: 128,
    success: 96,
  },
  {
    id: 'courier',
    name: 'Courier',
    role: 'Writing',
    blurb: 'Fast lane for summaries. Escalates the moment a number needs a source it cannot find.',
    tone: 'amber',
    model: 'gpt-5.2',
    effort: 'medium',
    posture: 'risky',
    tools: ['files.read', 'files.write', 'media.transcribe'],
    questions: 4,
    runs: 96,
    success: 94,
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Audit',
    blurb: 'Read-only by policy. Produces findings with file, line and reachability; never a patch.',
    tone: 'violet',
    model: 'claude-sonnet-5',
    effort: 'low',
    posture: 'auto',
    tools: ['files.read', 'shell.exec', 'vault.read'],
    questions: 4,
    runs: 214,
    success: 97,
  },
]

export const providers: Provider[] = [
  { id: 'anthropic', name: 'Anthropic', mark: 'A', status: 'connected', keyMask: 'sk-ant-••••7f2a', models: 6, note: 'Opus 5 · Sonnet 5 · Haiku 4.5', tone: 'amber' },
  { id: 'openai', name: 'OpenAI', mark: 'O', status: 'connected', keyMask: 'sk-••••91cd', models: 9, note: 'GPT-5.2 · GPT-5 mini', tone: 'lime' },
  { id: 'typesafe', name: 'TypeSafe AI', mark: 'J', status: 'connected', keyMask: 'tsk_••••0eJ4', models: 1, note: 'Jev · System 1 only', tone: 'violet' },
  { id: 'google', name: 'Google', mark: 'G', status: 'missing', models: 5, note: 'Gemini 3 Pro · Flash', tone: 'blue' },
  { id: 'openrouter', name: 'OpenRouter', mark: 'R', status: 'missing', models: 140, note: 'Long-tail models, one key', tone: 'violet' },
  { id: 'workers-ai', name: 'Workers AI', mark: 'W', status: 'connected', keyMask: 'account binding', models: 12, note: 'Fallback lane on this Worker', tone: 'blue' },
]

export const lanes: Lane[] = [
  { id: 'reflex', label: 'Reflex', purpose: 'Typed decisions, routing, guards', model: 'typesafe / jev-1.14.0' },
  { id: 'reasoning', label: 'Reasoning', purpose: 'Plans, audits, hard debugging', model: 'anthropic / claude-opus-5' },
  { id: 'builder', label: 'Builder', purpose: 'Default System 2 lane', model: 'anthropic / claude-sonnet-5' },
  { id: 'fast', label: 'Fast', purpose: 'Short rewrites, titles', model: 'openai / gpt-5-mini' },
]

export const settings: Settings = {
  runtime: 'simulated',
  jevModel: 'jev-1.14.0',
  s2Model: 'claude-sonnet-5',
  effort: 'medium',
  thresholds: { accept: 0.62, escalate: 0.55, risky: 0.5 },
  posture: 'risky',
  compact: false,
  reducedMotion: false,
}

/* ------------------------------------------------------------------ *
   Chats
   ------------------------------------------------------------------ */

export const chats: Chat[] = [
  {
    id: 'chat_release',
    title: 'Billing release notes from this week',
    pinned: true,
    status: 'idle',
    agentId: 'courier',
    preview: 'Four themes, 18 PRs, one migration note left open',
    updated: '12m ago',
    createdAt: 'Today',
    tags: ['billing', 'release'],
    plan: [
      { id: 'p1', label: 'Pull merged PRs since v0.3.0', status: 'done' },
      { id: 'p2', label: 'Group by theme and drop chores', status: 'done' },
      { id: 'p3', label: 'Draft the notes with links', status: 'done' },
      { id: 'p4', label: 'Flag the nullable plan_id question', status: 'done' },
    ],
    messages: [
      {
        id: 'm1',
        kind: 'user',
        at: '09:41',
        text: 'Summarize what changed in billing this week and turn it into a release note. Flag anything you cannot verify.',
      },
      {
        id: 'm2',
        kind: 'trace',
        trace: {
          id: 'tr1',
          route: 's1',
          s1: {
            model: 'jev-1.14.0',
            version: 'jev-1.14.0',
            latencyMs: 284,
            costUsd: 0.0003,
            promptTokens: 6_140,
            questions: 5,
            decision: 'search_files',
            confidence: 0.86,
            probabilities: { search_files: 0.86, read_file: 0.08, respond: 0.04, escalate: 0.02 },
            validation: 'ok',
          },
          baselineUsd: 0.041,
          savedUsd: 0.0407,
        },
      },
      {
        id: 'm3',
        kind: 'tool',
        name: 'files.search',
        title: 'Searched 9 files for “billing”',
        input: 'pattern="billing|invoice|plan" scope=workspace',
        output: '4 matches\n\nreports/billing-weekly.md\nplans/billing-release.md\ndrafts/v0.4-notes.md\ndata/competitor-scan.csv',
        status: 'ok',
        ms: 640,
      },
      {
        id: 'm4',
        kind: 'trace',
        trace: {
          id: 'tr2',
          route: 's1',
          s1: {
            model: 'jev-1.14.0',
            version: 'jev-1.14.0',
            latencyMs: 301,
            costUsd: 0.0003,
            promptTokens: 7_320,
            questions: 5,
            decision: 'read_file',
            confidence: 0.91,
            probabilities: { read_file: 0.91, search_files: 0.05, respond: 0.03, escalate: 0.01 },
            validation: 'ok',
          },
          baselineUsd: 0.044,
          savedUsd: 0.0437,
        },
      },
      {
        id: 'm5',
        kind: 'tool',
        name: 'files.read',
        title: 'Read reports/billing-weekly.md',
        input: 'reports/billing-weekly.md · 31 lines',
        output:
          '# Billing: this week\n\n- Plan changes: Scale tier replaces Team above 25 seats (#118)\n- Annual billing prorated to the day (#121)\n- Invoice PDFs respect account locale (#116)\n- Dunning no longer double-fires (#123)\n\nMigration note: plan_id may be null for grandfathered accounts.',
        status: 'ok',
        ms: 280,
      },
      {
        id: 'm6',
        kind: 'trace',
        trace: {
          id: 'tr3',
          route: 's2',
          s1: {
            model: 'jev-1.14.0',
            version: 'jev-1.14.0',
            latencyMs: 266,
            costUsd: 0.0003,
            promptTokens: 7_910,
            questions: 5,
            decision: 'escalate',
            confidence: 0.78,
            probabilities: { escalate: 0.78, read_file: 0.11, respond: 0.08, search_files: 0.03 },
            validation: 'ok',
          },
          escalation: {
            reason: 'needs_system_2 0.83 ≥ 0.55 — writing prose and judging a migration risk',
            threshold: 0.55,
            signal: 0.83,
            s2: {
              model: 'claude-sonnet-5',
              latencyMs: 4_180,
              costUsd: 0.041,
              plan: [
                'Group the merged PRs into themes',
                'Draft the note with links',
                'Verify the plan_id migration claim',
                'Write the draft and flag what is unverified',
              ],
            },
          },
          baselineUsd: 0.041,
          savedUsd: -0.036,
        },
      },
      {
        id: 'm7',
        kind: 'plan',
        steps: [
          { id: 'q1', label: 'Group the merged PRs into themes', status: 'done' },
          { id: 'q2', label: 'Draft the note with links', status: 'done' },
          { id: 'q3', label: 'Verify the plan_id migration claim', status: 'blocked' },
          { id: 'q4', label: 'Write the draft and flag what is unverified', status: 'active' },
        ],
      },
      {
        id: 'm8',
        kind: 'approval',
        title: 'Write drafts/v0.4-notes.md',
        detail:
          'Creates a new draft in the workspace. Nothing is published or pushed; the docs job waits for a second approval.',
        scope: ['write: drafts/v0.4-notes.md'],
        risk: 'low',
        status: 'approved',
        decision: 'Approved once',
        action: 'write',
        fileName: 'drafts/v0.4-notes.md',
      },
      {
        id: 'm9',
        kind: 'tool',
        name: 'files.write',
        title: 'Wrote drafts/v0.4-notes.md',
        input: 'drafts/v0.4-notes.md · 42 lines',
        status: 'ok',
        ms: 120,
      },
      {
        id: 'm10',
        kind: 'artifact',
        name: 'v0.4-notes.md',
        type: 'Markdown',
        meta: '42 lines · 18 links · 1 open question',
        target: 'files',
      },
      {
        id: 'm11',
        kind: 'assistant',
        at: '09:43',
        system: 's2',
        text: 'Four themes this release: plan clarity, annual billing, invoice correctness, and dunning.\n\nI drafted `drafts/v0.4-notes.md` with links to all 18 merged PRs and skipped the three chores. One thing needs you: `plan_id` may be null for grandfathered accounts. I could not verify that against production, so the note says so instead of guessing.',
      },
      { id: 'm12', kind: 'notice', text: 'System 1 handled 2 of 3 decisions · System 2 wrote 412 words · 1 approval' },
    ],
  },
  {
    id: 'chat_ratelimit',
    title: 'Why did the usage export dead-letter?',
    pinned: true,
    status: 'waiting',
    agentId: 'sentinel',
    preview: 'Stripe endpoint-concurrency exhausted the retry budget',
    updated: '38m ago',
    createdAt: 'Today',
    tags: ['infra'],
    plan: [
      { id: 'r1', label: 'Read the job attempts', status: 'done' },
      { id: 'r2', label: 'Identify the retry policy gap', status: 'done' },
      { id: 'r3', label: 'Propose a change (needs approval)', status: 'active' },
    ],
    messages: [
      {
        id: 'r1m',
        kind: 'user',
        at: '08:12',
        text: 'The Q3 usage export dead-lettered. Tell me why and what to change in the queue.',
      },
      {
        id: 'r2m',
        kind: 'trace',
        trace: {
          id: 'tr4',
          route: 's1',
          s1: {
            model: 'jev-1.14.0',
            version: 'jev-1.14.0',
            latencyMs: 242,
            costUsd: 0.0003,
            promptTokens: 4_820,
            questions: 5,
            decision: 'read_job',
            confidence: 0.94,
            probabilities: { read_job: 0.94, search_files: 0.03, escalate: 0.02, respond: 0.01 },
            validation: 'ok',
          },
          baselineUsd: 0.033,
          savedUsd: 0.0327,
        },
      },
      {
        id: 'r3m',
        kind: 'tool',
        name: 'jobs.inspect',
        title: 'Inspected job_801 · 5 attempts',
        input: 'job_801 · attempts=5 · provider=Stripe',
        output:
          'attempt 1  429 endpoint-concurrency   backoff 2.0s + jitter 0.4s\nattempt 2  429 endpoint-concurrency   backoff 4.0s - jitter 0.6s\nattempt 3  timeout                   backoff 8.0s + jitter 1.2s\nattempt 4  429 endpoint-concurrency   backoff 16s + jitter 0.9s\nattempt 5  429 endpoint-concurrency   cap 30s - jitter 2s\ndead_letter · retry budget exhausted · idempotency key preserved',
        status: 'ok',
        ms: 520,
      },
      {
        id: 'r4m',
        kind: 'assistant',
        at: '08:13',
        system: 's2',
        text: 'Two problems, one cause.\n\nThe queue retries `endpoint-concurrency` as a per-second rate limit, but Stripe counts it separately from RPM. With a 50-request concurrency ceiling and three parallel export shards, backoff alone cannot free a slot: every retry re-enters the same full semaphore.\n\nI would add a real semaphore per provider/endpoint (not just a token bucket), and split the export into two shards instead of three. Both are queue changes, so they need your approval before I touch `jobs/`.\n\nOne caveat: attempt 3 timed out with no provider request id, so Stripe may have processed it. The replay must use the original idempotency key, not a new one.',
      },
      {
        id: 'r5m',
        kind: 'approval',
        title: 'Apply the queue fix and replay with the original key',
        detail:
          'Edits `jobs/queue.ts` (semaphore by provider+endpoint) and `jobs/export.ts` (2 shards). Replays job_801 with its preserved idempotency key.',
        scope: ['write: jobs/queue.ts', 'write: jobs/export.ts', 'replay: job_801'],
        risk: 'medium',
        status: 'pending',
        action: 'write',
        fileName: 'plans/queue-fix.md',
      },
    ],
  },
  {
    id: 'chat_transcribe',
    title: 'Interview → chapters + quotes',
    pinned: false,
    status: 'running',
    agentId: 'scout',
    preview: 'Transcribing 28m founder interview, then chapters',
    updated: '1h ago',
    createdAt: 'Today',
    tags: ['media'],
    messages: [
      {
        id: 't1',
        kind: 'user',
        at: '07:20',
        text: 'Transcribe the founder interview, then pull the three strongest quotes about harness design.',
      },
      {
        id: 't2',
        kind: 'trace',
        trace: {
          id: 'tr5',
          route: 's1',
          s1: {
            model: 'jev-1.14.0',
            version: 'jev-1.14.0',
            latencyMs: 197,
            costUsd: 0.0003,
            promptTokens: 3_120,
            questions: 5,
            decision: 'transcribe',
            confidence: 0.97,
            probabilities: { transcribe: 0.97, respond: 0.02, escalate: 0.01, read_file: 0 },
            validation: 'ok',
          },
          baselineUsd: 0.028,
          savedUsd: 0.0277,
        },
      },
      {
        id: 't3',
        kind: 'tool',
        name: 'media.transcribe',
        title: 'Queued 4 chunks · Gemini',
        input: 'founder-interview.mp4 · 28:14 · 16 kHz mono',
        output: 'job_812 queued · chunk 1 running · retry policy: truncated exponential + jitter',
        status: 'ok',
        ms: 380,
      },
      {
        id: 't4',
        kind: 'notice',
        text: 'Waiting on Gemini rate limit · resumes automatically · countdown in Jobs',
      },
    ],
  },
  {
    id: 'chat_competitors',
    title: 'Q4 competitor pricing scan',
    pinned: false,
    status: 'idle',
    agentId: 'scout',
    preview: '12 pages crawled, one pricing change found',
    updated: 'Yesterday',
    createdAt: 'Yesterday',
    tags: ['research'],
    messages: [
      {
        id: 'c1',
        kind: 'user',
        at: '16:02',
        text: 'Scan competitor pricing pages and tell me what changed since the last CSV.',
      },
      {
        id: 'c2',
        kind: 'assistant',
        at: '16:04',
        system: 's2',
        text: 'One real change: Height moved Starter from $9 to $7 and cut the annual discount from 20% to 17%. Linear, Notion and ClickUp are unchanged.\n\n`data/competitor-scan.csv` is updated with a source column. The crawl used the Browserbase session recorded in Jobs if you want to check the page.',
      },
    ],
  },
  {
    id: 'chat_digest',
    title: 'Weekly ops digest',
    pinned: false,
    status: 'idle',
    agentId: 'courier',
    preview: 'Scheduled for Monday 09:00',
    updated: '2d ago',
    createdAt: 'Earlier',
    tags: ['automation'],
    messages: [
      {
        id: 'd1',
        kind: 'user',
        at: 'Mon',
        text: 'Summarize what the agents did last week and what needs me.',
      },
      {
        id: 'd2',
        kind: 'assistant',
        at: 'Mon',
        system: 's2',
        text: '38 runs, $4.12, 91% finished without a second gate. Two things still need you: the queue semaphore fix, and the nullable plan_id migration note.',
      },
    ],
  },
]
