import type {
  Agent,
  Automation,
  Job,
  Lane,
  MediaItem,
  Quota,
  Settings,
  Skill,
  WorkspaceFile,
  WorkspaceSnapshot,
} from '../types'

const file = (path: string, text: string): WorkspaceFile => ({
  path,
  text,
  bytes: new TextEncoder().encode(text).length,
  updated: 'just now',
  origin: 'agent',
})

export const starterFiles: WorkspaceFile[] = [
  file(
    'memory.md',
    `# Workspace memory

Index only. One line per topic; details live in memory/<topic>.md.

- [[projects]] — the folders this account works in
- [[preferences]] — terse replies, diffs before prose
- [[decisions]] — dual-process routing, approval posture, BYOK custody
`,
  ),
  file(
    'memory/decisions.md',
    `# Decisions

- Jev, System 1, answers typed questions and never writes prose.
- System 2 handles plans, judgement, and composed replies.
- Irreversible actions stop at an approval gate.
- Provider keys are encrypted in D1 and decrypted only inside the Worker.
- The workspace saves to D1 on a short debounce; owned per account.
`,
  ),
  file(
    'workspace/welcome.md',
    `# Welcome to sosystem

This workspace belongs to your account. Open **Settings → API keys** to add your own
TypeSafe and System 2 keys, then switch the runtime from Simulated to Live Worker.

Type \`/\` in the composer to attach a skill. Skills become visible chips on the chat turn
and are passed into System 2 as instructions.

Connect an MCP server in **Integrations** and run one of its tools to give the agent a real
external tool surface. MCP auth tokens are encrypted with your provider keys.
`,
  ),
]

export const defaultSkills: Skill[] = [
  {
    id: 'skill_release',
    name: 'Release notes',
    slug: 'release-notes',
    description: 'Turn merged work into a themed release note with links and open questions.',
    prompt:
      'Draft release notes from the workspace evidence. Group changes by theme, link every source, skip chores, and mark anything you cannot verify instead of guessing.',
    enabled: true,
    builtin: true,
  },
  {
    id: 'skill_research',
    name: 'Deep research',
    slug: 'research',
    description: 'Map what is known, find gaps, and separate evidence from inference.',
    prompt:
      'Before writing, list what the workspace proves, what is only suggested, and what is missing. Then write a compact synthesis with file citations and explicit open questions.',
    enabled: true,
    builtin: true,
  },
  {
    id: 'skill_review',
    name: 'Code review',
    slug: 'review',
    description: 'Find correctness, security, and regression risks before style.',
    prompt:
      'Review like a senior engineer. Prioritize correctness, security, data loss, and broken flows. Cite file paths and line references. Do not rewrite code until the findings are clear.',
    enabled: true,
    builtin: true,
  },
  {
    id: 'skill_mcp',
    name: 'MCP tool run',
    slug: 'mcp',
    description: 'Call a connected MCP tool only when the server and tool are named.',
    prompt:
      'Use a connected MCP tool only when the request names the server and tool. Read before write. Show the exact tool result and stop before any destructive action.',
    enabled: true,
    builtin: true,
  },
]

export const defaultAgents: Agent[] = [
  {
    id: 'forge',
    name: 'Forge',
    role: 'Implementation',
    blurb:
      'Reflex handles navigation and file reads; System 2 writes and patches. Stops on the third same-cause failure.',
    tone: 'lime',
    model: 'claude-sonnet-5',
    effort: 'medium',
    posture: 'risky',
    tools: ['files.read', 'files.write', 'files.search', 'shell.exec', 'git.pr', 'jobs.create'],
    questions: 5,
    runs: 0,
    success: 100,
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
    runs: 0,
    success: 100,
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
    runs: 0,
    success: 100,
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
    runs: 0,
    success: 100,
  },
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

export const lanes: Lane[] = [
  { id: 'reflex', label: 'Reflex', purpose: 'Typed decisions, routing, guards', model: 'typesafe / jev-1.14.0' },
  { id: 'reasoning', label: 'Reasoning', purpose: 'Plans, audits, hard debugging', model: 'anthropic / claude-opus-5' },
  { id: 'builder', label: 'Builder', purpose: 'Default System 2 lane', model: 'anthropic / claude-sonnet-5' },
  { id: 'fast', label: 'Fast', purpose: 'Short rewrites, titles', model: 'openai / gpt-5-mini' },
]

export const quotas: Quota[] = [
  { id: 'q1', provider: 'Gemini', metric: 'RPM', used: 0, limit: 15, resets: 'live' },
  { id: 'q2', provider: 'Gemini', metric: 'TPM', used: 0, limit: 1_000_000, resets: 'live' },
  { id: 'q3', provider: 'GitHub', metric: 'RPM', used: 0, limit: 5_000, resets: 'live' },
  { id: 'q4', provider: 'Gemini', metric: 'concurrency', used: 0, limit: 8, resets: 'live' },
]

export function defaultWorkspace(): WorkspaceSnapshot {
  return {
    chats: [],
    files: starterFiles.map((item) => ({ ...item })),
    jobs: [] as Job[],
    media: [] as MediaItem[],
    automations: [] as Automation[],
    agents: defaultAgents.map((item) => ({ ...item, tools: [...item.tools] })),
    skills: defaultSkills.map((item) => ({ ...item })),
    settings: { ...settings, thresholds: { ...settings.thresholds } },
  }
}
