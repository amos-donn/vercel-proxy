import {
  Bot,
  FolderClosed,
  Home,
  KeyRound,
  ListChecks,
  MessagesSquare,
  Settings,
  Sparkles,
  Timer,
} from 'lucide-react'
import type { View } from '../types'
import { cn } from '../lib/format'

const items: Array<{ view: View; label: string; icon: typeof Home }> = [
  { view: { name: 'home' }, label: 'Home', icon: Home },
  { view: { name: 'chats' }, label: 'Chats', icon: MessagesSquare },
  { view: { name: 'files' }, label: 'Files', icon: FolderClosed },
  { view: { name: 'vault' }, label: 'Vault', icon: KeyRound },
  { view: { name: 'jobs' }, label: 'Jobs', icon: ListChecks },
  { view: { name: 'media' }, label: 'Media', icon: Sparkles },
  { view: { name: 'automations' }, label: 'Automations', icon: Timer },
  { view: { name: 'integrations' }, label: 'Integrations', icon: Bot },
]

export function Rail({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const active = (name: View['name']) =>
    view.name === name || (view.name === 'chat' && name === 'chats')

  return (
    <nav className="rail" aria-label="Primary">
      <button
        type="button"
        className="rail-logo"
        onClick={() => onNavigate({ name: 'home' })}
        aria-label="sosystem home"
      >
        <svg viewBox="0 0 32 32" width="21" height="21" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M16 8v6M16 18v6M9.5 11.5l4.5 3M22.5 11.5l-4.5 3M9.5 20.5l4.5-3M22.5 20.5l-4.5-3" />
          </g>
          <circle cx="16" cy="16" r="2.4" fill="currentColor" />
        </svg>
      </button>

      <div className="rail-nav">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              className={cn('rail-btn', active(item.view.name) && 'is-active')}
              onClick={() => onNavigate(item.view)}
              aria-label={item.label}
              aria-current={active(item.view.name) ? 'page' : undefined}
              data-tip={item.label}
            >
              <Icon size={17} />
            </button>
          )
        })}
      </div>

      <div className="rail-foot">
        <button
          type="button"
          className={cn('rail-btn', view.name === 'settings' && 'is-active')}
          onClick={() => onNavigate({ name: 'settings' })}
          aria-label="Settings"
          data-tip="Settings"
        >
          <Settings size={17} />
        </button>
      </div>
    </nav>
  )
}
