import { useEffect, useRef, useState } from 'react'
import { ChevronUp, Command, LogOut, Settings, Sparkles, SunMoon } from 'lucide-react'
import { useStore } from '../store'
import type { View } from '../types'
import { Meter } from './ui'

export function ProfileMenu({
  onNavigate,
  onShortcuts,
}: {
  onNavigate: (view: View) => void
  onShortcuts: () => void
}) {
  const { settings, patchSettings, notify } = useStore()
  const [open, setOpen] = useState(false)
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

  return (
    <div className="profile" ref={ref}>
      {open ? (
        <div className="profile-pop" role="menu" aria-label="Account">
          <div className="profile-pop-head">
            <span className="avatar avatar-lg">AD</span>
            <div>
              <div className="profile-name">Amos Donn</div>
              <div className="profile-mail">amos@example.com</div>
            </div>
            <span className="chip chip-lime">owner</span>
          </div>

          <div className="profile-usage">
            <div className="spend-line">
              <span>November spend</span>
              <span className="mono">$4.12 <span className="faint">/ $25</span></span>
            </div>
            <Meter value={16} tone="lime" label="Monthly spend" />
            <p className="tiny faint">38 runs · 1.84M tokens · 91% fast-path</p>
          </div>

          <div className="profile-links">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onNavigate({ name: 'settings' }) }}>
              <Settings size={14} /> Settings
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
            <button type="button" className="profile-signout" onClick={() => notify('Accounts are not wired in this pass')}>
              <LogOut size={13} /> Sign out
            </button>
            <span className="mono tiny faint">v0.2.0 · prototype</span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="profile-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar">AD</span>
        <span className="profile-btn-copy">
          <span className="profile-btn-name">Amos Donn</span>
          <span className="profile-btn-plan">personal · owner</span>
        </span>
        <ChevronUp size={14} className={open ? 'rot-180' : ''} />
      </button>
    </div>
  )
}
