import { useState } from 'react'
import {
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  KeyRound,
  Loader2,
  Lock,
  Rocket,
  ShieldAlert,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import { useStore } from '../store'
import type { ApprovalPosture } from '../types'
import { cn, money } from '../lib/format'
import { Chip, Field, Meter, Modal, Segmented, Toggle } from '../components/ui'

const defaultThresholds = { accept: 0.62, escalate: 0.55, risky: 0.5 }

export function SettingsPage() {
  const { settings, providers, patchSettings, setPosture, notify } = useStore()
  const [health, setHealth] = useState<'idle' | 'checking' | 'ok' | 'down'>('idle')
  const [healthText, setHealthText] = useState('Not checked yet.')
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [keyValue, setKeyValue] = useState('')

  const testRuntime = async () => {
    setHealth('checking')
    setHealthText('Requesting /api/health…')
    try {
      const response = await fetch('/api/health')
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('application/json')) {
        throw new Error('No Worker attached — Vite answered with HTML.')
      }
      const body = (await response.json()) as { ok?: boolean; jev?: boolean; system2?: boolean }
      setHealth(body.ok ? 'ok' : 'down')
      setHealthText(
        `Worker ok · Jev ${body.jev ? 'key present' : 'key missing'} · System 2 ${body.system2 ? 'key present' : 'key missing'}`,
      )
    } catch (error) {
      setHealth('down')
      setHealthText(error instanceof Error ? error.message : 'Health check failed')
    }
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(`${label} copied`)
    } catch {
      notify('Clipboard blocked')
    }
  }

  return (
    <div className="page page-settings">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>
            The harness defaults: how cheap the fast path must be, when the heavy model wakes, and
            where a human is required. Changes are live and in-memory.
          </p>
        </div>
        <Chip tone="neutral">prototype · no accounts</Chip>
      </header>

      <div className="settings-grid">
        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Runtime</h2><span className="tiny faint">where decisions are made</span></div>
            <Cloud size={15} />
          </header>
          <Segmented
            value={settings.runtime}
            onChange={(runtime) => patchSettings({ runtime })}
            options={[
              { value: 'simulated', label: 'Simulated' },
              { value: 'live', label: 'Live Worker' },
            ]}
          />
          <p className="setting-copy">
            Simulated is deterministic and needs no keys: it exercises routing, tools, gates and costs.
            Live posts to <code>/api/jev</code> and <code>/api/system2</code>; the Worker holds the keys.
          </p>
          <div className="health-row">
            <button type="button" className="btn btn-sm" onClick={() => void testRuntime()} disabled={health === 'checking'}>
              {health === 'checking' ? <Loader2 size={12} className="spin" /> : <Zap size={12} />} Test runtime
            </button>
            <span className={cn('health-text', health === 'ok' && 'ok', health === 'down' && 'bad')}>{healthText}</span>
          </div>
          {settings.runtime === 'live' ? (
            <div className="inline-warn">
              <ShieldAlert size={12} />
              Live mode falls back to simulation per turn when a route is missing or the key is not set.
            </div>
          ) : null}
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>System 1 · Jev</h2><span className="tiny faint">typed decisions only</span></div>
            <Zap size={15} />
          </header>
          <Field label="Model">
            <select className="input mono" value={settings.jevModel} onChange={(event) => patchSettings({ jevModel: event.target.value })}>
              <option value="jev-1.14.0">jev-1.14.0</option>
              <option value="jev-1.13.2">jev-1.13.2</option>
            </select>
          </Field>
          <Field label={`Accept confidence · ${settings.thresholds.accept.toFixed(2)}`} hint="Below this, the turn escalates before any tool runs.">
            <input
              className="range"
              type="range"
              min={0.3}
              max={0.95}
              step={0.01}
              value={settings.thresholds.accept}
              onChange={(event) => patchSettings({ thresholds: { ...settings.thresholds, accept: Number(event.target.value) } })}
            />
          </Field>
          <Field label={`Escalate at needs_system_2 · ${settings.thresholds.escalate.toFixed(2)}`} hint="A typed probability, not a vibe. Lower means more System 2.">
            <input
              className="range"
              type="range"
              min={0.2}
              max={0.9}
              step={0.01}
              value={settings.thresholds.escalate}
              onChange={(event) => patchSettings({ thresholds: { ...settings.thresholds, escalate: Number(event.target.value) } })}
            />
          </Field>
          <Field label={`Risk gate · ${settings.thresholds.risky.toFixed(2)}`} hint="A write above this risk always stops for approval.">
            <input
              className="range"
              type="range"
              min={0.2}
              max={0.95}
              step={0.01}
              value={settings.thresholds.risky}
              onChange={(event) => patchSettings({ thresholds: { ...settings.thresholds, risky: Number(event.target.value) } })}
            />
          </Field>
          <button type="button" className="link-btn" onClick={() => patchSettings({ thresholds: defaultThresholds })}>
            Reset to defaults
          </button>
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>System 2</h2><span className="tiny faint">plans, judgement, prose</span></div>
            <Sparkles size={15} />
          </header>
          <Field label="Default lane">
            <select className="input mono" value={settings.s2Model} onChange={(event) => patchSettings({ s2Model: event.target.value })}>
              {['claude-sonnet-5', 'claude-opus-5', 'gpt-5.2', 'gpt-5-mini'].map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </Field>
          <Field label="Effort">
            <Segmented
              size="sm"
              value={settings.effort}
              onChange={(effort) => patchSettings({ effort })}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Field>
          <div className="stat-rows">
            <div><span>Baseline / escalated turn</span><span className="mono">{money(0.041)}</span></div>
            <div><span>Fast path / turn</span><span className="mono">{money(0.0003)}</span></div>
            <div><span>Budget this month</span><span className="mono">{money(4.12)} / {money(25)}</span></div>
          </div>
          <Meter value={16} tone="lime" label="Monthly spend" />
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Approval posture</h2><span className="tiny faint">irreversible actions</span></div>
            <ShieldAlert size={15} />
          </header>
          <div className="posture-column">
            {(
              [
                ['auto', 'Auto', 'Reads and drafts proceed. Writes, deletes and publishes still gate.'],
                ['risky', 'Gate risky', 'Any write, delete, publish or spend stops for one approval.'],
                ['ask', 'Ask first', 'Every tool call waits. Slowest, safest.'],
              ] as Array<[ApprovalPosture, string, string]>
            ).map(([value, label, copyText]) => (
              <button
                key={value}
                type="button"
                className={cn('posture-card', settings.posture === value && 'is-on')}
                onClick={() => setPosture(value)}
              >
                <span className="posture-radio">{settings.posture === value ? <Check size={10} /> : null}</span>
                <span>
                  <strong>{label}</strong>
                  <span>{copyText}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="setting-note">The typed risk answer can add a gate, never remove one.</p>
        </section>

        <section className="panel setting-section span-2">
          <header className="panel-head">
            <div><h2>Providers</h2><span className="tiny faint">BYOK · keys stay in the Worker</span></div>
            <KeyRound size={15} />
          </header>
          <div className="provider-list">
            {providers.map((provider) => (
              <div key={provider.id} className={cn('provider-row', provider.status === 'missing' && 'is-missing')}>
                <span className={cn('provider-mark', `tone-${provider.tone}`)}>{provider.mark}</span>
                <div className="provider-copy">
                  <strong>{provider.name}</strong>
                  <span className="tiny faint">{provider.note}</span>
                </div>
                <span className="provider-models mono tiny">{provider.models} models</span>
                <span className="provider-key mono tiny">{provider.keyMask ?? 'no key'}</span>
                {provider.status === 'connected' ? <Chip tone="lime">connected</Chip> : <Chip tone="amber">missing</Chip>}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setKeyName(provider.name)
                    setKeyOpen(true)
                  }}
                >
                  {provider.status === 'connected' ? 'Rotate' : 'Add key'} <ChevronRight size={10} />
                </button>
              </div>
            ))}
          </div>
          <div className="inline-note">
            <Lock size={12} />
            Keys are set as Worker secrets, not in this UI. <code>TYPESAFE_API_KEY</code>,{' '}
            <code>SYSTEM2_API_KEY</code>, optional <code>SYSTEM2_BASE_URL</code> and{' '}
            <code>SYSTEM2_MODEL</code>.
          </div>
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Interface</h2><span className="tiny faint">this browser</span></div>
          </header>
          <Toggle checked={settings.compact} onChange={(compact) => patchSettings({ compact })} label="Compact density" hint="Tighter rows in chats and tables." />
          <Toggle
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => {
              patchSettings({ reducedMotion })
              document.documentElement.classList.toggle('reduce-motion', reducedMotion)
            }}
            label="Reduce motion"
            hint="Stops streaming cadence and animated dots."
          />
          <Toggle checked={false} onChange={() => notify('Theme switching lands with the provider pass')} label="Light theme" hint="Not built yet; the dark shell is the only theme." disabled />
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Workspace</h2><span className="tiny faint">no accounts, no storage</span></div>
            <Database size={15} />
          </header>
          <div className="stat-rows">
            <div><span>Auth</span><span className="mono">not wired</span></div>
            <div><span>Persistence</span><span className="mono">memory only</span></div>
            <div><span>D1</span><span className="mono">not provisioned</span></div>
            <div><span>Deploy target</span><span className="mono">sosystem.amos-donn.workers.dev</span></div>
          </div>
          <p className="setting-copy">
            Reloading resets chats, files, secrets and jobs. That is deliberate for this pass; the
            storage schema and auth land next.
          </p>
        </section>

        <section className="panel setting-section span-2">
          <header className="panel-head">
            <div><h2>Deploy</h2><span className="tiny faint">Cloudflare Workers</span></div>
            <Rocket size={15} />
          </header>
          <div className="deploy-grid">
            <div className="deploy-card">
              <span className="deploy-label">Worker</span>
              <code>sosystem.amos-donn.workers.dev</code>
              <button type="button" className="link-btn" onClick={() => copy('https://sosystem.amos-donn.workers.dev', 'Worker URL')}>
                <Copy size={10} /> copy
              </button>
            </div>
            <div className="deploy-card">
              <span className="deploy-label">Secrets</span>
              <code>wrangler secret put TYPESAFE_API_KEY</code>
              <code>wrangler secret put SYSTEM2_API_KEY</code>
            </div>
          </div>
          <div className="command-row">
            <Terminal size={12} />
            <code>npm run build &amp;&amp; npx wrangler deploy</code>
            <button type="button" className="link-btn" onClick={() => copy('npm run build && npx wrangler deploy', 'Deploy command')}>
              <Copy size={10} /> copy
            </button>
          </div>
          <p className="setting-note">
            <Cloud size={11} /> The Worker serves the SPA, <code>/api/health</code>, <code>/api/jev</code> and{' '}
            <code>/api/system2</code>. Secrets are read at request time and never returned.
          </p>
        </section>
      </div>

      <footer className="settings-foot">
        <span className="mono">sosystem v0.2.0</span>
        <span>Built for Cloudflare Workers · React 19 · Jev {settings.jevModel}</span>
        <span className="grow" />
        <span>No accounts · no storage · BYOK</span>
      </footer>

      <Modal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        title={`${keyName} key`}
        subtitle="Keys are sealed as Worker secrets. This form is intentionally not a credential store."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setKeyOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!keyValue.trim()}
              onClick={() => {
                setKeyValue('')
                setKeyOpen(false)
                notify('Use wrangler secret put, or the Sites dashboard, so the key never touches the client')
              }}
            >
              I understand
            </button>
          </>
        }
      >
        <div className="inline-warn">
          <ShieldAlert size={12} />
          Do not paste a production key into this prototype: it has no encrypted storage yet. Set it with
          Wrangler or the hosting dashboard.
        </div>
        <Field label="Wrangler command" hint="Run this locally in the repo.">
          <input className="input mono" readOnly value={`npx wrangler secret put ${keyName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`} />
        </Field>
        <Field label="Paste to verify the field works (not stored)" htmlFor="key-value">
          <input id="key-value" className="input mono" type="password" value={keyValue} onChange={(event) => setKeyValue(event.target.value)} autoComplete="off" />
        </Field>
        <p className="tiny faint">The value is discarded immediately. Nothing is written to disk or state.</p>
      </Modal>
    </div>
  )
}
