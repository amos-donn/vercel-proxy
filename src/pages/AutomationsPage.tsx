import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  Play,
  Plus,
  Timer,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store'
import type { View } from '../types'
import { countdown } from '../lib/format'
import { Chip, Empty, Field, Modal, Toggle } from '../components/ui'

const cadences = [
  { label: 'Every 15 minutes', minutes: 15 },
  { label: 'Every hour', minutes: 60 },
  { label: 'Every day', minutes: 1_440 },
  { label: 'Every week', minutes: 10_080 },
]

export function AutomationsPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { automations, createChat, addAutomation, patchAutomation, deleteAutomation, notify } = useStore()
  const [now, setNow] = useState(Date.now())
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cadence, setCadence] = useState(1_440)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const runNow = (id: string) => {
    const automation = automations.find((item) => item.id === id)
    if (!automation) return
    const chatId = createChat(`${automation.prompt}`)
    patchAutomation(id, {
      lastRun: 'just now',
      runs: automation.runs + 1,
      nextAt: Date.now() + automation.everyMinutes * 60_000,
    })
    notify(`${automation.name} ran into a new chat`)
    onNavigate({ name: 'chat', id: chatId })
  }

  const create = () => {
    if (!name.trim() || !prompt.trim()) return
    addAutomation({
      id: `auto_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      prompt: prompt.trim(),
      everyMinutes: cadence,
      nextAt: Date.now() + cadence * 60_000,
      runs: 0,
      enabled: true,
    })
    setOpen(false)
    setName('')
    setPrompt('')
    setCadence(1_440)
    notify('Automation saved · Run now executes it immediately')
  }

  const active = automations.filter((item) => item.enabled).length
  const nextRun = automations.some((item) => item.enabled)
    ? countdown(Math.min(...automations.filter((item) => item.enabled).map((item) => Math.max(0, item.nextAt - now))))
    : '—'

  return (
    <div className="page page-automations">
      <header className="page-head">
        <div>
          <h1>Automations</h1>
          <p>
            Recurring work that starts a fresh thread. Each run gets the same typed harness, the same
            approval gate and its own trace, so a schedule never becomes an unreviewed agent.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={13} /> New automation
        </button>
      </header>

      <div className="auto-stats">
        <div><span className="mono">{active}</span><span>enabled</span></div>
        <div><span className="mono">{automations.reduce((sum, item) => sum + item.runs, 0)}</span><span>runs all time</span></div>
        <div><span className="mono">{nextRun}</span><span>next run</span></div>
      </div>

      <div className="auto-list">
        {automations.map((automation) => (
          <div key={automation.id} className={`auto-row ${automation.enabled ? '' : 'is-off'}`}>
            <div className="auto-icon">
              <Timer size={15} />
            </div>
            <div className="auto-main">
              <div className="auto-title">
                <strong>{automation.name}</strong>
                <Chip tone={automation.enabled ? 'lime' : 'neutral'}>{automation.enabled ? 'enabled' : 'paused'}</Chip>
                <span className="mono tiny faint">{cadenceLabel(automation.everyMinutes)}</span>
              </div>
              <p className="auto-prompt">{automation.prompt}</p>
              <div className="auto-meta">
                <span><Clock3 size={11} /> next {automation.enabled ? countdown(Math.max(0, automation.nextAt - now)) : 'paused'}</span>
                <span>{automation.runs} runs</span>
                {automation.lastRun ? <span>last {automation.lastRun}</span> : <span>never run</span>}
              </div>
            </div>
            <div className="auto-actions">
              <button type="button" className="btn btn-sm" onClick={() => runNow(automation.id)}>
                <Play size={11} /> Run now
              </button>
              <Toggle
                checked={automation.enabled}
                onChange={(next) => {
                  patchAutomation(automation.id, { enabled: next, nextAt: Date.now() + automation.everyMinutes * 60_000 })
                  notify(next ? `${automation.name} enabled` : `${automation.name} paused`)
                }}
                label="Enabled"
              />
              {confirmId === automation.id ? (
                <span className="confirm-inline">
                  sure?
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() => {
                      deleteAutomation(automation.id)
                      setConfirmId(null)
                      notify('Automation deleted')
                    }}
                  >
                    delete
                  </button>
                  <button type="button" className="link-btn" onClick={() => setConfirmId(null)}>cancel</button>
                </span>
              ) : (
                <button type="button" className="icon-btn danger" onClick={() => setConfirmId(automation.id)} aria-label="Delete automation">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {!automations.length ? (
          <Empty icon={<Timer size={18} />} title="No automations yet">
            Schedule the recurring work you already do by hand.
          </Empty>
        ) : null}
      </div>

      <div className="auto-note">
        <ArrowRight size={13} />
        <p>
          Cadence and prompt persist with the workspace. Nothing fires on a timer yet: the scheduler
          and its D1 run log are next, so “Run now” is how you execute the flow today.
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New automation"
        subtitle="A prompt, a cadence, and the same approval posture as a manual run."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!name.trim() || !prompt.trim()} onClick={create}>
              Create
            </button>
          </>
        }
      >
        <Field label="Name" htmlFor="auto-name">
          <input id="auto-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly release notes" />
        </Field>
        <Field label="Prompt" hint="Runs as the first user turn in a fresh chat." htmlFor="auto-prompt">
          <textarea
            id="auto-prompt"
            className="textarea"
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Draft release notes from merged PRs since the last tag…"
          />
        </Field>
        <Field label="Cadence">
          <select className="input" value={cadence} onChange={(event) => setCadence(Number(event.target.value))}>
            {cadences.map((option) => (
              <option key={option.minutes} value={option.minutes}>{option.label}</option>
            ))}
          </select>
        </Field>
      </Modal>
    </div>
  )
}

function cadenceLabel(minutes: number): string {
  if (minutes % 10_080 === 0) return `${minutes / 10_080}w`
  if (minutes % 1_440 === 0) return `${minutes / 1_440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}
