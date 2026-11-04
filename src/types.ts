/** Shared domain model for the Mezze workspace. */

export type Tone = 'lime' | 'blue' | 'violet' | 'amber' | 'red' | 'neutral'
export type ViewName =
  | 'home'
  | 'chats'
  | 'files'
  | 'canvas'
  | 'vault'
  | 'jobs'
  | 'media'
  | 'automations'
  | 'integrations'
  | 'agents'
  | 'skills'
  | 'settings'

export type View =
  | { name: ViewName; path?: string }
  | { name: 'chat'; id: string }

export type RuntimeMode = 'simulated' | 'live'
export type ApprovalPosture = 'auto' | 'risky' | 'ask'
export type ChatStatus = 'idle' | 'running' | 'waiting'

export interface PlanStep {
  id: string
  label: string
  status: 'done' | 'active' | 'pending' | 'blocked'
}

export interface DiffLine {
  t: 'add' | 'del' | 'ctx'
  text: string
}

export interface FileDiff {
  file: string
  additions: number
  deletions: number
  lines: DiffLine[]
}

/* ------------------------------------------------------------------ *
   Jev — typed decision primitives
 * ------------------------------------------------------------------ */

export type Question =
  | {
      id: string
      kind: 'choice'
      prompt: string
      options: Array<{ id: string; description?: string }>
    }
  | { id: string; kind: 'score'; prompt: string; levels: string[] }
  | { id: string; kind: 'noul'; statement: string }

export interface Answer {
  id: string
  choice?: string
  probabilities?: Record<string, number>
  confidence?: number
  score?: number
  value?: number
  noul?: number
  version?: string
}

export interface JevRequest {
  model: string
  state: Record<string, unknown>
  questions: Question[]
}

export interface Escalation {
  reason: string
  threshold: number
  signal: number
  s2: {
    model: string
    latencyMs: number
    costUsd: number
    plan: string[]
  }
}

export interface DecisionTrace {
  id: string
  route: 's1' | 's2'
  /** True when System 1 was unavailable and the turn went straight to the model. */
  direct?: boolean
  s1: {
    model: string
    version: string
    latencyMs: number
    costUsd: number
    promptTokens: number
    questions: number
    decision: string
    confidence: number
    probabilities: Record<string, number>
    validation: 'ok' | 'repaired' | 'failed'
    template?: string
  }
  escalation?: Escalation
  baselineUsd: number
  savedUsd: number
}

/* ------------------------------------------------------------------ *
   Chats
 * ------------------------------------------------------------------ */

export type ChatMessage =
  | { id: string; kind: 'user'; text: string; at: string; skills?: SkillRef[] }
  | {
      id: string
      kind: 'assistant'
      text: string
      at: string
      system: 's1' | 's2'
      streaming?: boolean
      template?: boolean
    }
  | { id: string; kind: 'trace'; trace: DecisionTrace }
  | { id: string; kind: 'plan'; steps: PlanStep[] }
  | {
      id: string
      kind: 'tool'
      name: string
      title: string
      input?: string
      output?: string
      status: 'running' | 'ok' | 'error'
      ms?: number
      diff?: FileDiff[]
    }
  | {
      id: string
      kind: 'approval'
      title: string
      detail: string
      scope: string[]
      risk: 'low' | 'medium' | 'high'
      status: 'pending' | 'approved' | 'denied'
      decision?: string
      action?: 'write' | 'delete'
      fileName?: string
    }
  | {
      id: string
      kind: 'artifact'
      name: string
      type: string
      meta: string
      target?: 'files' | 'media' | 'canvas'
      content?: string
      canvasId?: string
    }
  | { id: string; kind: 'notice'; text: string }

export interface Chat {
  id: string
  title: string
  pinned: boolean
  status: ChatStatus
  agentId: string
  preview: string
  updated: string
  createdAt: string
  messages: ChatMessage[]
  plan?: PlanStep[]
  tags?: string[]
  skillIds?: string[]
}

/* ------------------------------------------------------------------ *
   Files, vault
 * ------------------------------------------------------------------ */

export interface WorkspaceFile {
  path: string
  text?: string
  bytes: number
  updated: string
  origin: 'agent' | 'user'
}


/* ------------------------------------------------------------------ *
   Jobs & quota
 * ------------------------------------------------------------------ */

export type JobState =
  | 'queued'
  | 'running'
  | 'paused_rate'
  | 'paused_quota'
  | 'awaiting_approval'
  | 'succeeded'
  | 'failed'
  | 'dead_letter'

export interface JobAttempt {
  n: number
  at: string
  status: 'ok' | 'rate_limited' | 'error' | 'timeout'
  code?: string
  retryAfterMs?: number
  backoffMs?: number
  jitterMs?: number
  ms?: number
}

export interface Job {
  id: string
  title: string
  provider: string
  kind: 'transcribe' | 'sync' | 'crawl' | 'export'
  state: JobState
  attempt: number
  maxAttempts: number
  resumeAt?: number
  reason?: string
  costUsd: number
  createdAt: string
  detail: string
  attempts: JobAttempt[]
  mediaId?: string
  chatId?: string
  progress?: number
}

export interface Quota {
  id: string
  provider: string
  metric: 'RPM' | 'TPM' | 'concurrency' | 'spend'
  used: number
  limit: number
  resets: string
}

/* ------------------------------------------------------------------ *
   Media & transcripts
 * ------------------------------------------------------------------ */

export interface TranscriptLine {
  id: string
  startMs: number
  endMs: number
  text: string
  speaker?: string
}

export interface MediaItem {
  id: string
  name: string
  kind: 'video' | 'audio'
  durationSec: number
  sizeMb: number
  status: 'ready' | 'transcribing' | 'transcribed' | 'failed'
  transcript: TranscriptLine[]
  summary?: string
  expiresAt?: number
  tone: Tone
  src?: string
  uploadedAt: string
}

/* ------------------------------------------------------------------ *
   Automations, integrations, agents, providers
 * ------------------------------------------------------------------ */

export interface Automation {
  id: string
  name: string
  prompt: string
  everyMinutes: number
  nextAt: number
  runs: number
  enabled: boolean
  lastRun?: string
}

export interface Agent {
  id: string
  name: string
  role: string
  blurb: string
  tone: Tone
  model: string
  effort: 'low' | 'medium' | 'high'
  posture: ApprovalPosture
  tools: string[]
  questions: number
  runs: number
  success: number
}

export interface Provider {
  id: string
  name: string
  mark: string
  status: 'connected' | 'missing'
  keyMask?: string
  models: number
  note: string
  tone: Tone
  source?: 'user' | 'worker'
}

/* ------------------------------------------------------------------ *
   Skills, keys, MCP
 * ------------------------------------------------------------------ */

export interface SkillRef {
  id: string
  slug: string
  name: string
}

export interface Skill {
  id: string
  name: string
  slug: string
  description: string
  prompt: string
  enabled: boolean
  builtin?: boolean
}

export interface ApiKeyMeta {
  id: string
  name: string
  provider: string
  masked: string
  source: 'user' | 'worker'
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

export type McpTransport = 'streamable-http' | 'sse'

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServer {
  id: string
  name: string
  url: string
  transport: McpTransport
  enabled: boolean
  status: 'available' | 'connected' | 'error'
  authSet: boolean
  tools: McpTool[]
  toolsCount: number
  error?: string
  updatedAt: number
}

export interface WorkspaceSnapshot {
  chats: Chat[]
  files: WorkspaceFile[]
  canvases: Canvas[]
  jobs: Job[]
  media: MediaItem[]
  automations: Automation[]
  agents: Agent[]
  skills: Skill[]
  scheduled: ScheduledSend[]
  settings: Settings
}

export interface Canvas {
  id: string
  name: string
  description: string
  html: string
  css: string
  js: string
  origin: 'agent' | 'user'
  updatedAt: number
  chatId?: string
}

export interface CanvasDraft {
  name: string
  description: string
  html: string
  css: string
  js: string
}

export interface ScheduledSend {
  id: string
  chatId: string | null
  text: string
  skillIds: string[]
  toolCalls: McpToolCall[]
  sendAt: number
}

/* ------------------------------------------------------------------ *
   Session, keys, MCP transport
 * ------------------------------------------------------------------ */

export interface SessionUser {
  id: string
  email: string
  name: string
  createdAt: number
}

export interface KeyEvent {
  id: string
  action: string
  key: string
  outcome: string
  at: number
}

export interface ProviderStatus {
  configured: boolean
  masked?: string
  source?: 'user' | 'worker'
}

export interface KeyInventory {
  keys: ApiKeyMeta[]
  audit: KeyEvent[]
  providers: Record<string, ProviderStatus>
}

export interface McpCallResult {
  content: string
  raw?: unknown
}

export interface McpToolCall {
  serverId: string
  serverName: string
  tool: string
  args: Record<string, unknown>
}

export interface Lane {
  id: string
  label: string
  purpose: string
  model: string
}

export interface Thresholds {
  accept: number
  escalate: number
  risky: number
}

export interface Settings {
  runtime: RuntimeMode
  /** Set once the user picks a runtime by hand, so key detection can't override it. */
  runtimeChosen?: boolean
  jevModel: string
  s2Model: string
  effort: 'low' | 'medium' | 'high'
  thresholds: Thresholds
  posture: ApprovalPosture
  compact: boolean
  reducedMotion: boolean
}

/* Live provider model catalogs (OpenRouter today). */
export interface ModelOption {
  id: string
  name: string
  context: number
  promptPerMillion?: number
  completionPerMillion?: number
}

export interface ModelCatalog {
  provider: string
  models: ModelOption[]
  fetchedAt: number
}
