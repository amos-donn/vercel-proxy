import { useEffect, useRef, useState } from 'react'
import { ChevronUp, Command, LogOut, Settings, Sparkles, SunMoon } from 'lucide-react'
import { useStore } from '../store'
import type { View } from '../types'
import { Meter } from './ui'

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'S'

export function ProfileMenu({
  onNavigate,
  onShortcuts,
}: {
  onNavigate: (view: View) => void
  onShortcuts: () => void
}) {
  const { settings, patchSettings, notify, user, signOut, usage, chats, files, keys } = useStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = user?.name ?? 'Workspace owner'
  const email = user?.email ?? ''

  return (
    <div className="profile" ref={ref}>
      {open ? (
        <div className="profile-pop" role="menu" aria-label="Account">
          <div className="profile-pop-head">
            <span className="avatar avatar-lg">{initials(name)}</span>
            <div>
              <div className="profile-name">{name}</div>
              <div className="profile-mail">{email}</div>
            </div>
          </div>

          <div className="profile-usage">
            <div className="spend-line">
              <span>Workspace spend</span>
              <span className="mono">${usage.spend.toFixed(2)}</span>
            </div>
            <Meter value={Math.min(100, usage.fastPath)} tone="lime" label="Fast-path share" />
            <p className="tiny faint">
              {usage.decisions} decisions · {usage.fastPath}% fast-path · {keys.length} keys
            </p>
            <p className="tiny faint">
              {chats.length} chats · {files.length} files · saved to D1
            </p>
          </div>

          <div className="profile-links">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onNavigate({ name: 'settings' }) }}>
              <Settings size={14} /> Settings
            </button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onNavigate({ name: 'vault' }) }}>
              <Sparkles size={14} /> API keys
            </button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onShortcuts() }}>
              <Command size={14} /> Keyboard shortcuts
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                patchSettings({ compact: !settings.compact })
                notify(settings.compact ? 'Comfortable density' : 'Compact density')
              }}
            >
              <Sparkles size={14} /> {settings.compact ? 'Comfortable density' : 'Compact density'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                patchSettings({ reducedMotion: !settings.reducedMotion })
                document.documentElement.classList.toggle('reduce-motion', !settings.reducedMotion)
                notify(settings.reducedMotion ? 'Motion enabled' : 'Reduced motion enabled')
              }}
            >
              <SunMoon size={14} /> {settings.reducedMotion ? 'Enable motion' : 'Reduce motion'}
            </button>
          </div>

          <div className="profile-foot">
            <button
              type="button"
              className="profile-signout"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void signOut().finally(() => setBusy(false))
              }}
            >
              <LogOut size={13} /> {busy ? 'Signing out…' : 'Sign out'}
            </button>
            <span className="mono tiny faint">v0.3.0 · D1</span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="profile-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar">{initials(name)}</span>
        <span className="profile-btn-copy">
          <span className="profile-btn-name">{name}</span>
          <span className="profile-btn-plan">{email || 'signed in'}</span>
        </span>
        <ChevronUp size={14} className={open ? 'rot-180' : ''} />
      </button>
    </div>
  )
}
