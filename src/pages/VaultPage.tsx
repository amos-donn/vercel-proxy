import { useState } from 'react'
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store'
import type { AuditEvent, Secret } from '../types'
import { Chip, CheckRow, Empty, Field, Modal } from '../components/ui'

const agentScopes = ['Forge', 'Scout', 'Courier', 'Sentinel']

export function VaultPage() {
  const { secrets, audit, addSecret, revealSecret, deleteSecret, notify } = useStore()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [scopes, setScopes] = useState<string[]>(['Forge'])
  const [visibility, setVisibility] = useState<'masked' | 'restricted'>('masked')

  const toggleReveal = (secret: Secret) => {
    if (secret.visibility === 'restricted') {
      notify('Restricted secret · replace only, never revealed')
      return
    }
    if (revealed[secret.id]) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[secret.id]
        return next
      })
      return
    }
    const plaintext = revealSecret(secret.id)
    if (plaintext) setRevealed((prev) => ({ ...prev, [secret.id]: plaintext }))
  }

  const copySecret = async (secret: Secret) => {
    if (secret.visibility === 'restricted') {
      notify('Restricted secret · copy denied')
      return
    }
    const plaintext = revealSecret(secret.id)
    if (!plaintext) return
    try {
      await navigator.clipboard.writeText(plaintext)
      notify(`${secret.key} copied · audit entry added`)
    } catch {
      notify('Clipboard blocked in this browser')
    }
  }

  const create = () => {
    if (!key.trim() || !value.trim() || !scopes.length) return
    addSecret({
      key: key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      value: value.trim(),
      scope: scopes,
      visibility,
    })
    setAddOpen(false)
    setKey('')
    setValue('')
    setScopes(['Forge'])
    setVisibility('masked')
    notify('Secret added · encrypted at rest, audit entry written')
  }

  return (
    <div className="page page-vault">
      <header className="page-head">
        <div>
          <h1>Vault</h1>
          <p>
            Provider keys for the workspace. The Worker injects them; the browser only ever sees a mask
            unless you reveal one, and every reveal is logged.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add secret
        </button>
      </header>

      <div className="vault-summary">
        <div className="vault-card">
          <KeyRound size={15} />
          <div>
            <strong>{secrets.length} keys</strong>
            <span>{secrets.filter((secret) => secret.visibility === 'restricted').length} restricted · envelope encrypted</span>
          </div>
        </div>
        <div className="vault-card">
          <ShieldCheck size={15} />
          <div>
            <strong>AES-256-GCM</strong>
            <span>per-workspace KEK · crypto-shred on revoke</span>
          </div>
        </div>
        <div className="vault-card">
          <Eye size={15} />
          <div>
            <strong>{audit.length} events</strong>
            <span>injections, reveals, denials</span>
          </div>
        </div>
      </div>

      <div className="vault-layout">
        <section className="panel">
          <header className="panel-head">
            <h2>Secrets</h2>
            <span className="tiny faint">values never leave the Worker unless revealed</span>
          </header>
          <div className="secret-list">
            {secrets.map((secret) => (
              <div key={secret.id} className="secret-row">
                <div className="secret-main">
                  <div className="secret-key mono">
                    {secret.key}
                    <Chip tone={secret.visibility === 'restricted' ? 'violet' : 'neutral'}>
                      {secret.visibility}
                    </Chip>
                  </div>
                  <div className="secret-value mono">
                    {revealed[secret.id] ?? '••••••••••••••••••••••••'}
                  </div>
                  <div className="secret-meta">
                    <span className="tiny faint">scope: {secret.scope.join(', ')}</span>
                    <span className="tiny faint">updated {secret.updated}</span>
                    {secret.lastUsed ? <span className="tiny faint">used {secret.lastUsed}</span> : null}
                  </div>
                </div>
                <div className="secret-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => toggleReveal(secret)}
                    aria-label={secret.visibility === 'restricted' ? 'Restricted secret' : revealed[secret.id] ? 'Hide value' : 'Reveal value'}
                  >
                    {secret.visibility === 'restricted' ? <Lock size={14} /> : revealed[secret.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button type="button" className="icon-btn" onClick={() => void copySecret(secret)} aria-label="Copy secret">
                    <Copy size={14} />
                  </button>
                  {confirmId === secret.id ? (
                    <span className="confirm-inline">
                      sure?
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => {
                          deleteSecret(secret.id)
                          setConfirmId(null)
                          notify(`${secret.key} deleted · crypto-shred queued`)
                        }}
                      >
                        delete
                      </button>
                      <button type="button" className="link-btn" onClick={() => setConfirmId(null)}>
                        cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="icon-btn danger" onClick={() => setConfirmId(secret.id)} aria-label="Delete secret">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!secrets.length ? <Empty title="No secrets yet">Add a provider key to give an agent a tool.</Empty> : null}
          </div>
          <footer className="panel-foot">
            <span className="tiny faint">Restricted keys can be replaced or revoked, never read back.</span>
          </footer>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Audit log</h2>
            <span className="tiny faint">append-only</span>
          </header>
          <div className="audit-list">
            {audit.map((event) => (
              <div key={event.id} className="audit-row">
                <span className={`audit-dot ${event.outcome === 'denied' ? 'denied' : 'ok'}`} />
                <div className="audit-copy">
                  <span className="audit-line">
                    <strong>{event.action}</strong> {event.key}
                  </span>
                  <span className="tiny faint">{event.actor} · {event.at}</span>
                </div>
                <Chip tone={event.outcome === 'denied' ? 'red' : 'neutral'}>{event.outcome}</Chip>
              </div>
            ))}
          </div>
          <footer className="panel-foot">
            <span className="tiny faint">Every injection and reveal is recorded with actor and time.</span>
          </footer>
        </section>
      </div>

      <div className="vault-note">
        <Lock size={13} />
        <div>
          <strong>Custody model</strong>
          <p>
            Keys are encrypted with a per-workspace key, unwrapped inside the Worker, and scoped to the
            agents you tick. A denied tool call never receives a value. This pass keeps the vault in
            memory: closing the tab clears everything.
          </p>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a secret"
        subtitle="Stored in this session only. The value is never returned to the client again."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!key.trim() || !value.trim() || !scopes.length}
              onClick={create}
            >
              Add to vault
            </button>
          </>
        }
      >
        <Field label="Key" hint="Upper snake case, e.g. GEMINI_API_KEY" htmlFor="secret-key">
          <input
            id="secret-key"
            className="input mono"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="PROVIDER_API_KEY"
          />
        </Field>
        <Field label="Value" htmlFor="secret-value">
          <input
            id="secret-value"
            className="input mono"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Visible to">
          <div className="check-grid">
            {agentScopes.map((agent) => (
              <CheckRow
                key={agent}
                label={agent}
                checked={scopes.includes(agent)}
                onChange={(next) =>
                  setScopes((prev) => (next ? [...prev, agent] : prev.filter((item) => item !== agent)))
                }
              />
            ))}
          </div>
        </Field>
        <Field label="Visibility">
          <div className="radio-row">
            <button
              type="button"
              className={`radio-card ${visibility === 'masked' ? 'is-on' : ''}`}
              onClick={() => setVisibility('masked')}
            >
              <strong>Masked</strong>
              <span>Reveal and copy on demand, logged.</span>
            </button>
            <button
              type="button"
              className={`radio-card ${visibility === 'restricted' ? 'is-on' : ''}`}
              onClick={() => setVisibility('restricted')}
            >
              <strong>Restricted</strong>
              <span>Replace only. Never readable by a human or agent.</span>
            </button>
          </div>
        </Field>
      </Modal>
    </div>
  )
}

export function actionTone(event: AuditEvent) {
  return event.outcome === 'denied' ? 'red' : 'neutral'
}
