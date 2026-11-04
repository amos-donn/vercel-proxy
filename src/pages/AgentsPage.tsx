import { useState } from 'react'
import {
  ArrowRight,
  Brain,
  Gauge,
  MessageSquarePlus,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useStore } from '../store'
import type { ApprovalPosture, Agent, View } from '../types'
import { cn, money } from '../lib/format'
import { CheckRow, Chip, Meter, Segmented } from '../components/ui'

const allTools = [
  'files.read',
  'files.write',
  'files.search',
  'shell.exec',
  'git.pr',
  'web.fetch',
  'browser',
  'vault.read',
  'jobs.create',
  'media.transcribe',
]

const models = ['claude-opus-5', 'claude-sonnet-5', 'gpt-5.2', 'gpt-5-mini', 'claude-haiku-4.5']

export function AgentsPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { agents, settings, patchAgent, notify } = useStore()
  const [selectedId, setSelectedId] = useState(agents[0]?.id ?? '')
  const agent = agents.find((item) => item.id === selectedId) ?? agents[0]

  if (!agent) return null

  const patch = (change: Partial<Agent>) => {
    patchAgent(agent.id, change)
  }

  return (
    <div className="page page-agents">
      <header className="page-head">
        <div>
          <h1>Agents</h1>
          <p>
            Each agent is a harness, not a prompt. The typed decision layer is shared; the persona
            changes the tool belt, the System 2 lane and what counts as risky.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => onNavigate({ name: 'home' })}>
          <MessageSquarePlus size={13} /> Start a turn
        </button>
      </header>

      <div className="agent-grid">
        {agents.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn('agent-card', item.id === agent.id && 'is-active')}
            onClick={() => setSelectedId(item.id)}
          >
            <div className="agent-card-head">
              <span className={cn('agent-mark', `tone-${item.tone}`)}>{item.name.slice(0, 1)}</span>
              <div>
                <strong>{item.name}</strong>
                <span className="tiny faint">{item.role}</span>
              </div>
              <Chip tone={item.posture === 'auto' ? 'blue' : item.posture === 'risky' ? 'amber' : 'violet'}>
                {item.posture === 'auto' ? 'auto' : item.posture === 'risky' ? 'gated writes' : 'asks first'}
              </Chip>
            </div>
            <p>{item.blurb}</p>
            <div className="agent-card-foot">
              <span className="mono tiny">{item.model}</span>
              <span className="tiny faint">{item.tools.length} tools</span>
              <span className="tiny faint">{item.success}% ok</span>
            </div>
          </button>
        ))}
      </div>

      <div className="agent-layout">
        <section className="panel agent-editor">
          <header className="panel-head">
            <div className="agent-editor-title">
              <span className={cn('agent-mark', `tone-${agent.tone}`)}>{agent.name.slice(0, 1)}</span>
              <div>
                <h2>{agent.name}</h2>
                <span className="tiny faint">{agent.role} · {agent.runs} runs · {agent.questions} typed questions per turn</span>
              </div>
            </div>
          </header>

          <div className="editor-grid">
            <div className="field">
              <span className="field-label">System 2 lane</span>
              <select className="input mono" value={agent.model} onChange={(event) => patch({ model: event.target.value })}>
                {models.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
              <p className="field-hint">Only this lane writes prose. System 1 is always Jev.</p>
            </div>

            <div className="field">
              <span className="field-label">Effort</span>
              <Segmented
                size="sm"
                value={agent.effort}
                onChange={(effort) => patch({ effort })}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
              <p className="field-hint">Higher effort widens the plan and the audit pass.</p>
            </div>

            <div className="field field-wide">
              <span className="field-label">Approval posture</span>
              <div className="posture-row">
                {(
                  [
                    ['auto', 'Auto', 'Reads and drafts run without a gate. Writes still ask.'],
                    ['risky', 'Gate risky', 'Any write, delete, publish or spend stops for approval.'],
                    ['ask', 'Ask first', 'Every tool call waits for a human.'],
                  ] as Array<[ApprovalPosture, string, string]>
                ).map(([value, label, copy]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn('posture-card', agent.posture === value && 'is-on')}
                    onClick={() => patch({ posture: value })}
                  >
                    <strong>{label}</strong>
                    <span>{copy}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field field-wide">
              <span className="field-label">Tool belt</span>
              <div className="check-grid check-grid-3">
                {allTools.map((tool) => (
                  <CheckRow
                    key={tool}
                    label={tool}
                    checked={agent.tools.includes(tool)}
                    onChange={(next) =>
                      patch({
                        tools: next
                          ? [...agent.tools, tool]
                          : agent.tools.filter((item) => item !== tool),
                      })
                    }
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Questions per turn</span>
              <input
                className="range"
                type="range"
                min={3}
                max={8}
                value={agent.questions}
                onChange={(event) => patch({ questions: Number(event.target.value) })}
              />
              <p className="field-hint">{agent.questions} typed answers before the router decides.</p>
            </div>

            <div className="field">
              <span className="field-label">Success rate</span>
              <Meter value={agent.success} tone={agent.success >= 95 ? 'lime' : 'blue'} />
              <p className="field-hint">{agent.success}% of {agent.runs} runs finished without a retry.</p>
            </div>
          </div>

          <footer className="editor-foot">
            <span className="tiny faint">Changes apply to this session immediately.</span>
            <button type="button" className="btn btn-sm" onClick={() => notify(`${agent.name} configuration saved for this session`)}>
              Saved <CheckMark />
            </button>
          </footer>
        </section>

        <aside className="agent-side">
          <section className="panel">
            <header className="panel-head"><h2>Dual-process</h2><Chip tone="violet">shared</Chip></header>
            <div className="agent-loop">
              <div className="loop-node compact">
                <span className="loop-icon lime"><Zap size={12} /></span>
                <div><strong>System 1</strong><span>Jev {settings.jevModel} · {agent.questions} questions</span></div>
              </div>
              <div className="agent-gate">
                <ShieldAlert size={12} />
                <span>confidence ≥ {settings.thresholds.accept.toFixed(2)} and needs_system_2 &lt; {settings.thresholds.escalate.toFixed(2)}</span>
              </div>
              <div className="loop-node compact">
                <span className="loop-icon violet"><Brain size={12} /></span>
                <div><strong>System 2</strong><span>{agent.model} · {agent.effort} effort</span></div>
              </div>
            </div>
            <div className="side-section">
              <div className="stat-rows">
                <div><span>Posture</span><span className="mono">{agent.posture}</span></div>
                <div><span>Tools</span><span className="mono">{agent.tools.length}</span></div>
                <div><span>Avg / run</span><span className="mono">{money(0.014)}</span></div>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head"><h2>Recent</h2><span className="tiny faint">this agent</span></header>
            <div className="agent-recent">
              {[
                ['Billing release notes', '2 escalations · 412 words'],
                ['Queue semaphore fix', '1 gate · awaiting you'],
                ['Competitor scan', '12 pages · 1 change'],
              ].map(([title, meta]) => (
                <button key={title} type="button" className="mini-row" onClick={() => onNavigate({ name: 'chats' })}>
                  <span>
                    <strong>{title}</strong>
                    <span className="tiny faint">{meta}</span>
                  </span>
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
            <footer className="panel-foot">
              <span className="tiny faint"><Sparkles size={10} /> Every run keeps its own trace</span>
            </footer>
          </section>

          <section className="panel">
            <header className="panel-head"><h2>Posture</h2><Gauge size={13} /></header>
            <p className="tiny faint">
              Writes, deletes, publishes and spends stop at the gate regardless of System 1 confidence.
              The typed risk answer can only add a gate, never remove one.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function CheckMark() {
  return <span aria-hidden="true">✓</span>
}
