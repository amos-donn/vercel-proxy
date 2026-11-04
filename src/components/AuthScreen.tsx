import { useState, type FormEvent } from 'react'
import { ArrowRight, Brain, Database, KeyRound, Loader2, Lock, ShieldCheck, Zap } from 'lucide-react'
import { useStore } from '../store'
import { ApiError } from '../lib/api'
import { cn } from '../lib/format'

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} aria-hidden="true">
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M16 8v6M16 18v6M9.5 11.5l4.5 3M22.5 11.5l-4.5 3M9.5 20.5l4.5-3M22.5 20.5l-4.5-3" />
        </g>
        <circle cx="16" cy="16" r="2.4" fill="currentColor" />
      </svg>
    </span>
  )
}

export function Boot() {
  return (
    <div className="boot">
      <BrandMark size={40} />
      <p className="mono tiny faint">opening your workspace…</p>
    </div>
  )
}

export function AuthScreen() {
  const { signIn, signUp } = useStore()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(name, email, password)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the Worker.')
      setBusy(false)
    }
  }

  const swap = (next: 'in' | 'up') => {
    setMode(next)
    setError(null)
  }

  return (
    <div className="auth">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-shell">
        <aside className="auth-aside">
          <div className="auth-brand">
            <BrandMark size={34} />
            <div>
              <strong>Mezze</strong>
              <span className="mono tiny faint">dual-process agent workspace</span>
            </div>
          </div>

          <h1>
            Typed decisions on the fast path.
            <br />
            <span>Prose only when it is earned.</span>
          </h1>
          <p className="auth-lede">
            Jev answers fixed questions in a couple hundred milliseconds. The heavy model wakes for
            plans, judgement and writing. Every irreversible move stops at a gate.
          </p>

          <ul className="auth-points">
            <li>
              <span className="auth-point-icon tone-lime"><Zap size={13} /></span>
              <div>
                <strong>System 1 routes, System 2 writes</strong>
                <span>Confidence thresholds decide before a token of prose is spent.</span>
              </div>
            </li>
            <li>
              <span className="auth-point-icon tone-blue"><Database size={13} /></span>
              <div>
                <strong>Your workspace, saved</strong>
                <span>Chats, files, agents and skills persist to D1 per account.</span>
              </div>
            </li>
            <li>
              <span className="auth-point-icon tone-violet"><KeyRound size={13} /></span>
              <div>
                <strong>Bring your own keys</strong>
                <span>AES-GCM at rest. Decrypted only inside the Worker, never returned.</span>
              </div>
            </li>
            <li>
              <span className="auth-point-icon tone-amber"><Brain size={13} /></span>
              <div>
                <strong>MCP tools the agent can run</strong>
                <span>Discover a server's tools, attach a call, feed the result to System 2.</span>
              </div>
            </li>
          </ul>
        </aside>

        <section className="auth-panel">
          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'in'}
              className={cn('auth-tab', mode === 'in' && 'is-active')}
              onClick={() => swap('in')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'up'}
              className={cn('auth-tab', mode === 'up' && 'is-active')}
              onClick={() => swap('up')}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'up' ? (
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  required
                  maxLength={80}
                />
              </label>
            ) : null}

            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                placeholder={mode === 'in' ? 'Your password' : 'At least 8 characters'}
                minLength={8}
                required
              />
            </label>

            {error ? <p className="auth-error" role="alert">{error}</p> : null}

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? <Loader2 size={13} className="spin" /> : null}
              {mode === 'in' ? 'Sign in' : 'Create workspace'}
              {!busy ? <ArrowRight size={13} /> : null}
            </button>

            <p className="auth-legal tiny faint">
              <ShieldCheck size={11} />
              Sessions are an HttpOnly cookie. Passwords are PBKDF2-SHA256 with a per-user salt.
            </p>
          </form>

          <footer className="auth-foot">
            <Lock size={11} />
            <span>
              This deployment stores accounts, workspaces and encrypted keys in its own D1 database.
              Nobody else can read your workspace.
            </span>
          </footer>
        </section>
      </div>
    </div>
  )
}
