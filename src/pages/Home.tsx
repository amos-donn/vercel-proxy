import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  FileText,
  FolderClosed,
  KeyRound,
  ListChecks,
  Pin,
  Play,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'
import { useStore } from '../store'
import type { McpToolCall, Skill, View } from '../types'
import { Composer, type ComposerMode } from '../components/Composer'
import { Chip, StatusPill } from '../components/ui'
import { cn, money } from '../lib/format'

export function Home({ onNavigate }: { onNavigate: (view: View) => void }) {
  const {
    chats,
    jobs,
    files,
    media,
    automations,
    keys,
    mcpServers,
    skills,
    agents,
    usage,
    user,
    createChat,
    patchChat,
    settings,
    notify,
    saveNow,
  } = useStore()
  const [mode, setMode] = useState<ComposerMode>('auto')
  const [think, setThink] = useState(false)

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name.split(/\s+/)[0] ?? 'there'

  const pinned = chats.filter((chat) => chat.pinned).slice(0, 2)
  const running = jobs.filter(
    (job) => job.state === 'running' || job.state === 'paused_rate' || job.state === 'awaiting_approval',
  )
  const latestFile = useMemo(
    () => [...files].sort((a, b) => (a.updated === 'just now' ? -1 : 1))[0],
    [files],
  )
  const connectedServers = mcpServers.filter((server) => server.enabled)
  const enabledSkills = skills.filter((skill) => skill.enabled)

  const start = (text: string, _attachments: string[], picked: Skill[], toolCalls: McpToolCall[]) => {
    const ids = picked.map((skill) => skill.id)
    const id = createChat(text, 'forge', ids, toolCalls)
    const tags = [...(mode !== 'auto' ? [mode, 'force-s2'] : []), ...(think ? ['think', 'force-s2'] : [])]
    if (tags.length) patchChat(id, { tags })
    onNavigate({ name: 'chat', id })
  }

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="eyebrow">
            <span className={cn('dot', settings.runtime === 'live' && 'dot-live')} />
            {settings.runtime === 'live' ? 'live worker · your keys' : 'simulated · add keys to go live'}
          </div>
          <h1>
            {greeting}, {firstName}.
          </h1>
          <p className="home-sub">
            Ask for the outcome. Reflex handles the next move, the heavy model only wakes for plans and
            prose, and anything irreversible stops at a gate.
          </p>

          <Composer
            variant="hero"
            autoFocus
            placeholder="What should the workspace do?"
            mode={mode}
            onModeChange={setMode}
            think={think}
            onThinkChange={setThink}
            agent={undefined}
            onSubmit={start}
          />

          <div className="suggestions">
            {[
              ['Draft release notes from this week', 'write'],
              ['Why did the usage export dead-letter?', 'research'],
              ['Transcribe the founder interview', 'auto'],
              ['Turn the competitor CSV into a memo', 'write'],
            ].map(([label]) => (
              <button key={label} type="button" className="suggestion" onClick={() => start(label, [], [], [])}>
                <Sparkles size={12} /> {label}
              </button>
            ))}
          </div>
        </header>

        <div className="home-grid">
          <section className="home-card span-2">
            <header className="card-head">
              <div>
                <h2>Pick up where you left off</h2>
                <p>Pinned work, live jobs and the file you touched last.</p>
              </div>
              <button type="button" className="link-btn" onClick={() => onNavigate({ name: 'chats' })}>
                All chats <ArrowUpRight size={12} />
              </button>
            </header>

            <div className="continue-grid">
              {pinned.map((chat) => (
                <button key={chat.id} type="button" className="continue-card" onClick={() => onNavigate({ name: 'chat', id: chat.id })}>
                  <span className="continue-top">
                    <Pin size={11} /> pinned chat
                    {chat.status === 'waiting' ? <Chip tone="amber">needs you</Chip> : null}
                  </span>
                  <span className="continue-title">{chat.title}</span>
                  <span className="continue-preview">{chat.preview}</span>
                  <span className="continue-foot">
                    {chat.agentId} · {chat.updated} <ArrowRight size={11} />
                  </span>
                </button>
              ))}

              {running.slice(0, 1).map((job) => (
                <button key={job.id} type="button" className="continue-card" onClick={() => onNavigate({ name: 'jobs' })}>
                  <span className="continue-top">
                    <StatusPill
                      label={job.state === 'awaiting_approval' ? 'awaiting approval' : job.state === 'paused_rate' ? 'rate limited' : 'running'}
                      tone={job.state === 'awaiting_approval' ? 'amber' : job.state === 'paused_rate' ? 'amber' : 'blue'}
                      live={job.state === 'running'}
                    />
                    {job.provider}
                  </span>
                  <span className="continue-title">{job.title}</span>
                  <span className="continue-preview">{job.detail}</span>
                  <span className="continue-foot">job {job.id.replace('job_', '#')} <ArrowRight size={11} /></span>
                </button>
              ))}

              {latestFile && latestFile.text ? (
                <button
                  type="button"
                  className="continue-card"
                  onClick={() => onNavigate({ name: 'files', path: latestFile.path })}
                >
                  <span className="continue-top">
                    <FileText size={11} /> latest artifact
                  </span>
                  <span className="continue-title mono">{latestFile.path}</span>
                  <span className="continue-preview">
                    {latestFile.text.split('\n').slice(0, 2).join(' ').slice(0, 110)}
                  </span>
                  <span className="continue-foot">{(latestFile.bytes / 1024).toFixed(1)} KB · {latestFile.origin}</span>
                </button>
              ) : null}

              {!pinned.length && !running.length && !latestFile ? (
                <p className="tiny faint">Nothing here yet. Start a chat and it will show up.</p>
              ) : null}
            </div>
          </section>

          <section className="home-card loop-card">
            <header className="card-head">
              <div>
                <h2>The loop</h2>
                <p>Typed decisions, then prose.</p>
              </div>
              <Chip tone="violet">jev</Chip>
            </header>

            <div className="loop">
              <div className="loop-node">
                <span className="loop-icon lime"><Zap size={13} /></span>
                <div>
                  <strong>System 1 · 240–320 ms</strong>
                  <span>Picks the next action from typed options. Cannot write a sentence.</span>
                </div>
              </div>
              <div className="loop-arrow"><ArrowRight size={12} /></div>
              <div className="loop-branch">
                <div>
                  <span className="mono tiny">conf ≥ {settings.thresholds.accept}</span>
                  <strong>act</strong>
                </div>
                <div>
                  <span className="mono tiny">doubt</span>
                  <strong>escalate</strong>
                </div>
              </div>
              <div className="loop-node">
                <span className="loop-icon violet"><Brain size={13} /></span>
                <div>
                  <strong>System 2 · 3–5 s</strong>
                  <span>Plans, judges, writes. Only sees the turns S1 cannot finish.</span>
                </div>
              </div>
            </div>

            <div className="loop-foot">
              <span className="mono">{money(usage.spend)}</span> this workspace
              <span className="loop-foot-right">
                {usage.decisions ? `${usage.fastPath}% fast-path` : 'no turns yet'}
              </span>
            </div>
          </section>

          <section className="home-card">
            <header className="card-head">
              <div>
                <h2>This workspace</h2>
                <p>Everything the agent can touch.</p>
              </div>
            </header>
            <div className="stat-grid">
              <button type="button" className="stat-link" onClick={() => onNavigate({ name: 'files' })}>
                <FolderClosed size={14} />
                <span className="stat-value">{files.length}</span>
                <span className="stat-label">files</span>
              </button>
              <button type="button" className="stat-link" onClick={() => onNavigate({ name: 'vault' })}>
                <KeyRound size={14} />
                <span className="stat-value">{keys.length}</span>
                <span className="stat-label">keys</span>
              </button>
              <button type="button" className="stat-link" onClick={() => onNavigate({ name: 'jobs' })}>
                <ListChecks size={14} />
                <span className="stat-value">{jobs.length}</span>
                <span className="stat-label">jobs</span>
              </button>
              <button type="button" className="stat-link" onClick={() => onNavigate({ name: 'skills' })}>
                <BookOpen size={14} />
                <span className="stat-value">{enabledSkills.length}</span>
                <span className="stat-label">skills</span>
              </button>
            </div>
            <div className="divider" />
            <div className="mini-list">
              <button type="button" className="mini-row" onClick={() => onNavigate({ name: 'automations' })}>
                <Timer size={13} /> {automations.filter((item) => item.enabled).length} automations running
                <ArrowRight size={12} />
              </button>
              <button type="button" className="mini-row" onClick={() => onNavigate({ name: 'integrations' })}>
                <Sparkles size={13} /> {connectedServers.length} MCP servers ·{' '}
                {connectedServers.reduce((sum, server) => sum + server.toolsCount, 0)} tools
                <ArrowRight size={12} />
              </button>
              <button type="button" className="mini-row" onClick={() => onNavigate({ name: 'agents' })}>
                <Brain size={13} /> {agents.length} agents · dual-process defaults
                <ArrowRight size={12} />
              </button>
            </div>
          </section>

          <section className="home-card">
            <header className="card-head">
              <div>
                <h2>Try a tool</h2>
                <p>Not everything starts with a chat.</p>
              </div>
            </header>
            <div className="tool-grid">
              {[
                { label: 'Files', icon: FolderClosed, view: 'files' as const },
                { label: 'Vault', icon: KeyRound, view: 'vault' as const },
                { label: 'Skills', icon: BookOpen, view: 'skills' as const },
                { label: 'MCP', icon: Sparkles, view: 'integrations' as const },
                { label: 'Automations', icon: Timer, view: 'automations' as const },
                { label: 'Media', icon: Sparkles, view: 'media' as const },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    type="button"
                    className="tool-tile"
                    onClick={() => onNavigate({ name: item.view })}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <footer className="home-foot">
          <Play size={11} /> Saved to D1 for {user?.email ?? 'this account'} ·{' '}
          {media.length} media items · keys are encrypted at rest.
          <button type="button" className="link-btn" onClick={() => void saveNow().then(() => notify('Workspace saved'))}>
            Save now
          </button>
        </footer>
      </div>
    </div>
  )
}
