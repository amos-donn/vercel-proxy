import { useEffect, useState } from 'react'
import {
  Fingerprint,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store'
import { providers as providerCatalog } from '../data/providers'
import { api } from '../lib/api'
import { cn } from '../lib/format'
import { Chip, Empty, Field, Modal } from '../components/ui'

const timeAgo = (at: number): string => {
  if (!at) return '—'
  const diff = Date.now() - at
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(at).toLocaleDateString()
}

export function VaultPage() {
  const { keys, keyAudit, providers, saveKey, deleteKey, refreshKeys, notify } = useStore()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState(providerCatalog[0])
  const [name, setName] = useState(providerCatalog[0].keyName)
  const [value, setValue] = useState('')
  const [custom, setCustom] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmName, setConfirmName] = useState<string | null>(null)
  const [custody, setCustody] = useState<string | null>(null)

  useEffect(() => {
    void api
      .health()
      .then((health) => setCustody(health.keyCustody))
      .catch(() => setCustody(null))
  }, [])

  const start = (keyName?: string) => {
    const known = providerCatalog.find((provider) => provider.keyName === keyName) ?? providerCatalog[0]
    setPreset(known)
    setCustom(Boolean(keyName && !providerCatalog.some((provider) => provider.keyName === keyName)))
    setName(keyName ?? known.keyName)
    setValue('')
    setError(null)
    setOpen(true)
  }

  const submit = async () => {
    if (!value.trim()) {
      setError('Paste the key value.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveKey(name, value, custom ? undefined : preset.id)
      notify(`${name} encrypted and stored`)
      setOpen(false)
      setValue('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not store that key.')
    } finally {
      setBusy(false)
    }
  }

  const userKeys = keys.filter((key) => key.source === 'user')
  const workerKeys = keys.filter((key) => key.source === 'worker')

  return (
    <div className="page page-vault">
      <header className="page-head">
        <div>
          <h1>Vault</h1>
          <p>
            Your provider keys. Values are write-only once stored: the Worker decrypts a key only for
            the upstream call that needs it, and this page never receives it back.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => void refreshKeys()} title="Reload key metadata">
            <RefreshCw size={13} /> Refresh
          </button>
          <button type="button" className="btn btn-primary" onClick={() => start()}>
            <Plus size={13} /> Add key
          </button>
        </div>
      </header>

      <div className="vault-summary">
        <div className="vault-card">
          <KeyRound size={15} />
          <div>
            <strong>{userKeys.length} of your keys</strong>
            <span>{workerKeys.length} worker secrets · AES-GCM at rest</span>
          </div>
        </div>
        <div className="vault-card">
          <ShieldCheck size={15} />
          <div>
            <strong>{keys.length} configured</strong>
            <span>
              {providers.filter((provider) => provider.status === 'connected').length} of{' '}
              {providers.length} providers ready
            </span>
          </div>
        </div>
        <div className="vault-card">
          <Fingerprint size={15} />
          <div>
            <strong>{keyAudit.length} audit events</strong>
            <span>created, replaced, deleted</span>
          </div>
        </div>
      </div>

      <div className="vault-layout">
        <section className="panel">
          <header className="panel-head">
            <h2>Keys</h2>
            <span className="tiny faint">
              {custody === 'worker-secret'
                ? 'sealed with SOSYSTEM_SECRET'
                : custody === 'd1-fallback'
                  ? 'sealed with a generated deployment key'
                  : 'sealed in the Worker'}
            </span>
          </header>
          <div className="secret-list">
            {keys.map((key) => (
              <div key={key.id} className="secret-row">
                <div className="secret-main">
                  <div className="secret-key mono">
                    {key.name}
                    <Chip tone={key.source === 'user' ? 'lime' : 'violet'}>
                      {key.source === 'user' ? 'yours' : 'worker'}
                    </Chip>
                  </div>
                  <div className="secret-value mono">{key.masked}</div>
                  <div className="secret-meta">
                    <span className="tiny faint">
                      {providerCatalog.find((provider) => provider.id === key.provider)?.name ?? key.provider}
                    </span>
                    <span className="tiny faint">
                      updated {key.source === 'user' ? timeAgo(key.updatedAt) : 'from the environment'}
                    </span>
                    <span className="tiny faint">
                      {key.lastUsedAt ? `used ${timeAgo(key.lastUsedAt)}` : 'not used yet'}
                    </span>
                  </div>
                </div>
                <div className="secret-actions">
                  {key.source === 'user' ? (
                    <>
                      <button type="button" className="link-btn" onClick={() => start(key.name)}>
                        Replace
                      </button>
                      {confirmName === key.name ? (
                        <span className="confirm-inline">
                          sure?
                          <button
                            type="button"
                            className="danger-link"
                            onClick={() => {
                              void deleteKey(key.name)
                                .then(() => notify(`${key.name} deleted`))
                                .catch((caught: unknown) =>
                                  notify(caught instanceof Error ? caught.message : 'Delete failed'),
                                )
                              setConfirmName(null)
                            }}
                          >
                            delete
                          </button>
                          <button type="button" className="link-btn" onClick={() => setConfirmName(null)}>
                            cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => setConfirmName(key.name)}
                          aria-label={`Delete ${key.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="tiny faint">set as a Worker secret</span>
                  )}
                </div>
              </div>
            ))}
            {!keys.length ? (
              <Empty
                icon={<KeyRound size={18} />}
                title="No keys yet"
                action={
                  <button type="button" className="btn btn-primary" onClick={() => start()}>
                    <Plus size={13} /> Add your first key
                  </button>
                }
              >
                Add a TypeSafe key for Jev and a System 2 key (Anthropic, OpenAI, Google or OpenRouter).
              </Empty>
            ) : null}
          </div>
          <footer className="panel-foot">
            <span className="tiny faint">
              Replacing a key overwrites the ciphertext in place. Deleting it removes the row.
            </span>
          </footer>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Audit log</h2>
            <span className="tiny faint">newest first</span>
          </header>
          <div className="audit-list">
            {keyAudit.map((event) => (
              <div key={event.id} className="audit-row">
                <span className={cn('audit-dot', event.outcome === 'denied' ? 'denied' : 'ok')} />
                <div className="audit-copy">
                  <span className="audit-line">
                    <strong>{event.action}</strong> {event.key}
                  </span>
                  <span className="tiny faint">{timeAgo(event.at)}</span>
                </div>
                <Chip tone={event.outcome === 'denied' ? 'red' : 'neutral'}>{event.outcome}</Chip>
              </div>
            ))}
            {!keyAudit.length ? <p className="tiny faint">Every create, replace and delete lands here.</p> : null}
          </div>
          <footer className="panel-foot">
            <span className="tiny faint">Written server-side at the moment the key changes.</span>
          </footer>
        </section>
      </div>

      <div className="vault-note">
        <Lock size={13} />
        <div>
          <strong>Custody</strong>
          <p>
            Keys are sealed with AES-GCM before they are written to D1. When a turn runs, the Worker
            decrypts the one key it needs for that request and keeps it in memory only. There is no
            reveal endpoint and no copy-to-clipboard path, so a stolen browser session cannot read a
            stored key.
          </p>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={keys.some((key) => key.name === name) ? 'Replace key' : 'Add a key'}
        subtitle="The value is encrypted before it leaves the request handler."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Encrypting…' : 'Store key'}
            </button>
          </>
        }
      >
        {!custom ? (
          <Field label="Provider">
            <select
              className="input"
              value={preset.id}
              onChange={(event) => {
                const next = providerCatalog.find((provider) => provider.id === event.target.value)
                if (!next) return
                setPreset(next)
                setName(next.keyName)
                setError(null)
              }}
            >
              {providerCatalog.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {provider.keyName}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Key name" hint="Upper snake case. Unknown names are stored as custom keys." htmlFor="key-name">
          <input
            id="key-name"
            className="input mono"
            value={name}
            onChange={(event) => {
              setName(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))
              setCustom(true)
            }}
          />
        </Field>

        <Field label="Value" hint="Paste once. It cannot be read back." htmlFor="key-value">
          <input
            id="key-value"
            className="input mono"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            placeholder="sk-…"
          />
        </Field>

        {error ? <p className="field-error">{error}</p> : null}

        <p className="tiny faint">
          <ShieldCheck size={10} /> Anthropic, OpenAI, Google and OpenRouter keys are used by System 2.
          TypeSafe is used by Jev.
        </p>
      </Modal>
    </div>
  )
}
