import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  Clock3,
  FileText,
  FolderClosed,
  KeyRound,
  ListChecks,
  MessageSquarePlus,
  Search,
  Sparkles,
  Timer,
} from 'lucide-react'
import { StoreProvider, useStore } from './store'
import type { View, ViewName } from './types'
import { cn, money } from './lib/format'
import { Rail } from './components/Rail'
import { Sidebar } from './components/Sidebar'
import { Composer, type ComposerMode } from './components/Composer'
import { CommandPalette } from './components/CommandPalette'
import { Chip, Meter, StatusPill } from './components/ui'
import { Home } from './pages/Home'
import { ChatsPage } from './pages/ChatsPage'
import { ChatView } from './pages/ChatView'
import { FilesPage } from './pages/FilesPage'
import { VaultPage } from './pages/VaultPage'
import { JobsPage } from './pages/JobsPage'
import { MediaPage } from './pages/MediaPage'
import { AutomationsPage } from './pages/AutomationsPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { AgentsPage } from './pages/AgentsPage'
import { SettingsPage } from './pages/SettingsPage'

const titles: Record<ViewName, string> = {
  home: 'Home',
  chats: 'Chats',
  files: 'Files',
  vault: 'Vault',
  jobs: 'Jobs',
  media: 'Media',
  automations: 'Automations',
  integrations: 'Integrations',
  agents: 'Agents',
  settings: 'Settings',
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { chats, settings, jobs, files } = useStore()
  const [view, setView] = useState<View>({ name: 'home' })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [homeToken, setHomeToken] = useState(0)
  const [shortcuts, setShortcuts] = useState(false)

  const navigate = (next: View) => {
    setView(next)
    setPaletteOpen(false)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
      if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setView({ name: 'home' })
        setHomeToken((value) => value + 1)
      }
      if (event.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeChat = view.name === 'chat' ? chats.find((chat) => chat.id === view.id) : undefined
  const crumb = view.name === 'chat' ? activeChat?.title ?? 'Chat' : titles[view.name]
  const waiting = jobs.filter((job) => job.state === 'awaiting_approval').length

  return (
    <div className={cn('app', settings.compact && 'compact', settings.reducedMotion && 'reduce-motion')}>
      <Rail view={view} onNavigate={navigate} />
      <Sidebar
        view={view}
        onNavigate={navigate}
        onNewChat={() => {
          setView({ name: 'home' })
          setHomeToken((value) => value + 1)
        }}
        onShortcuts={() => setShortcuts(true)}
      />

      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb-root">sosystem</span>
            <span className="crumb">
              <span className="crumb-sep">/</span>
              {crumb}
            </span>
          </div>
          <div className="topbar-right">
            {waiting ? (
              <button type="button" className="topbar-alert" onClick={() => navigate({ name: 'jobs' })}>
                {waiting} approval{waiting === 1 ? '' : 's'} waiting
              </button>
            ) : null}
            <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
              <Search size={13} />
              <span>Search or jump</span>
              <kbd className="kbd">⌘K</kbd>
            </button>
            <button
              type="button"
              className={cn('runtime-badge', settings.runtime === 'live' ? 'is-live' : '')}
              onClick={() => navigate({ name: 'settings' })}
              title={settings.runtime === 'live' ? 'Worker routes configured' : 'Deterministic simulation'}
            >
              <span className="dot" />
              {settings.runtime === 'live' ? 'live runtime' : 'simulated'}
            </button>
          </div>
        </header>

        <div className={cn('view', view.name === 'chat' && 'view-chat')}>
          {view.name === 'home' ? (
            <Home key={homeToken} onNavigate={navigate} />
          ) : null}
          {view.name === 'chats' ? <ChatsPage onNavigate={navigate} /> : null}
          {view.name === 'chat' ? <ChatView key={view.id} id={view.id} onNavigate={navigate} /> : null}
          {view.name === 'files' ? <FilesPage /> : null}
          {view.name === 'vault' ? <VaultPage /> : null}
          {view.name === 'jobs' ? <JobsPage /> : null}
          {view.name === 'media' ? <MediaPage /> : null}
          {view.name === 'automations' ? <AutomationsPage onNavigate={navigate} /> : null}
          {view.name === 'integrations' ? <IntegrationsPage /> : null}
          {view.name === 'agents' ? <AgentsPage onNavigate={navigate} /> : null}
          {view.name === 'settings' ? <SettingsPage /> : null}
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        counts={{ chats: chats.length, files: files.length, jobs: jobs.length }}
      />

      {shortcuts ? (
        <div className="modal-layer" role="presentation" onMouseDown={() => setShortcuts(false)}>
          <div className="shortcut-sheet" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <h2>Keyboard</h2>
              <button type="button" className="icon-btn" onClick={() => setShortcuts(false)} aria-label="Close">
                ✕
              </button>
            </header>
            {[
              ['⌘ K', 'Command palette'],
              ['⌘ N', 'New chat'],
              ['⌘ ⇧ N', 'New chat without workspace context'],
              ['⌘ \\', 'Toggle sidebar'],
              ['⌘ /', 'This sheet'],
              ['↵', 'Send · Shift ↵ for a new line'],
              ['Esc', 'Close overlays'],
            ].map(([key, label]) => (
              <div key={key} className="shortcut-row">
                <kbd className="kbd">{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
            <p className="tiny faint">Sidebar toggle lands with the storage pass; the rest are live.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
