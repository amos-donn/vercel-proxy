import { useEffect, useState } from 'react'
import { BookOpen, ChevronRight, CircleAlert, Loader2, Search } from 'lucide-react'
import { StoreProvider, useStore } from './store'
import type { View, ViewName } from './types'
import { cn } from './lib/format'
import { Rail } from './components/Rail'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { AuthScreen, Boot } from './components/AuthScreen'
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
import { SkillsPage } from './pages/SkillsPage'
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
  skills: 'Skills',
  settings: 'Settings',
}

export default function App() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  )
}

function Gate() {
  const { status } = useStore()
  if (status === 'loading') return <Boot />
  if (status === 'anon') return <AuthScreen />
  return <Shell />
}

function Shell() {
  const { chats, settings, jobs, files, saveState } = useStore()
  const [view, setView] = useState<View>({ name: 'home' })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [homeToken, setHomeToken] = useState(0)
  const [shortcuts, setShortcuts] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
      if (meta && event.key === '\\') {
        event.preventDefault()
        setSidebarOpen((value) => !value)
      }
      if (meta && event.key === '/') {
        event.preventDefault()
        setShortcuts(true)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setShortcuts(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeChat = view.name === 'chat' ? chats.find((chat) => chat.id === view.id) : undefined
  const crumb = view.name === 'chat' ? activeChat?.title ?? 'Chat' : titles[view.name]
  const waiting = jobs.filter((job) => job.state === 'awaiting_approval').length

  return (
    <div
      className={cn(
        'app',
        settings.compact && 'compact',
        settings.reducedMotion && 'reduce-motion',
        !sidebarOpen && 'sidebar-hidden',
      )}
    >
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
            <span
              className={cn(
                'save-indicator',
                saveState === 'saving' && 'is-saving',
                saveState === 'error' && 'is-error',
              )}
              title="Workspace snapshots are written to D1"
            >
              {saveState === 'saving' ? (
                <Loader2 size={10} className="spin" />
              ) : saveState === 'error' ? (
                <CircleAlert size={10} />
              ) : (
                <span className="dot" />
              )}
              {saveState === 'saving' ? 'saving' : saveState === 'error' ? 'save failed' : 'saved'}
            </span>
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
              title={
                settings.runtime === 'live'
                  ? 'Turns call your configured providers'
                  : 'Deterministic simulation'
              }
            >
              <span className="dot" />
              {settings.runtime === 'live' ? 'live runtime' : 'simulated'}
            </button>
          </div>
        </header>

        <div className={cn('view', view.name === 'chat' && 'view-chat')}>
          {view.name === 'home' ? <Home key={homeToken} onNavigate={navigate} /> : null}
          {view.name === 'chats' ? <ChatsPage onNavigate={navigate} /> : null}
          {view.name === 'chat' ? <ChatView key={view.id} id={view.id} onNavigate={navigate} /> : null}
          {view.name === 'files' ? (
            <FilesPage key={view.path ?? 'files-root'} initialPath={view.path} />
          ) : null}
          {view.name === 'vault' ? <VaultPage /> : null}
          {view.name === 'jobs' ? <JobsPage /> : null}
          {view.name === 'media' ? <MediaPage /> : null}
          {view.name === 'automations' ? <AutomationsPage onNavigate={navigate} /> : null}
          {view.name === 'integrations' ? <IntegrationsPage /> : null}
          {view.name === 'agents' ? <AgentsPage onNavigate={navigate} /> : null}
          {view.name === 'skills' ? <SkillsPage onNavigate={navigate} /> : null}
          {view.name === 'settings' ? <SettingsPage onNavigate={navigate} /> : null}
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
          <div
            className="shortcut-sheet"
            role="dialog"
            aria-label="Keyboard shortcuts"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Keyboard</h2>
              <button type="button" className="icon-btn" onClick={() => setShortcuts(false)} aria-label="Close">
                ✕
              </button>
            </header>
            {[
              ['⌘ K', 'Command palette'],
              ['⌘ N', 'New chat'],
              ['⌘ \\', 'Toggle sidebar'],
              ['⌘ /', 'This sheet'],
              ['/', 'Attach a skill in the composer'],
              ['↵', 'Send · Shift ↵ for a new line'],
              ['Esc', 'Close overlays'],
            ].map(([key, label]) => (
              <div key={key} className="shortcut-row">
                <kbd className="kbd">{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
            <p className="tiny faint">
              <BookOpen size={10} /> Skills insert as chips, then travel with the turn.
              <ChevronRight size={10} /> MCP tools attach the same way.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
