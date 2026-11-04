import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  ChevronDown,
  FolderClosed,
  KeyRound,
  ListChecks,
  MessagesSquare,
  Pin,
  Plus,
  Search,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useStore } from '../store'
import type { Chat, View } from '../types'
import { cn, money } from '../lib/format'
import { ProfileMenu } from './ProfileMenu'
import { StatusPill } from './ui'

const toolLinks: Array<{ view: View; label: string; icon: typeof FolderClosed; key: 'files' | 'secrets' | 'jobs' | 'media' | 'automations' }> = [
  { view: { name: 'files' }, label: 'Files', icon: FolderClosed, key: 'files' },
  { view: { name: 'vault' }, label: 'Vault', icon: KeyRound, key: 'secrets' },
  { view: { name: 'media' }, label: 'Media', icon: Sparkles, key: 'media' },
  { view: { name: 'automations' }, label: 'Automations', icon: Timer, key: 'automations' },
  { view: { name: 'jobs' }, label: 'Jobs', icon: ListChecks, key: 'jobs' },
]

export function Sidebar({
  view,
  onNavigate,
  onNewChat,
  onShortcuts,
}: {
  view: View
  onNavigate: (view: View) => void
  onNewChat: () => void
  onShortcuts: () => void
}) {
  const { chats, files, secrets, jobs, media, automations, togglePin } = useStore()
  const [query, setQuery] = useState('')
  const [toolsOpen, setToolsOpen] = useState(true)

  const counts = {
    files: files.length,
    secrets: secrets.length,
    jobs: jobs.filter((job) => job.state !== 'succeeded').length,
    media: media.length,
    automations: automations.filter((item) => item.enabled).length,
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(q) ||
        chat.preview.toLowerCase().includes(q) ||
        chat.tags?.some((tag) => tag.includes(q)),
    )
  }, [chats, query])

  const pinned = filtered.filter((chat) => chat.pinned)
  const recent = filtered.filter((chat) => !chat.pinned)
  const groups = useMemo(() => groupChats(recent), [recent])

  return (
    <aside className="sidebar" aria-label="Chats and tools">
      <div className="ws">
        <div className="ws-mark">S</div>
        <div className="ws-copy">
          <span className="ws-name">sosystem</span>
          <span className="ws-plan">personal workspace</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => onNavigate({ name: 'settings' })}>
          <ChevronDown size={14} />
        </button>
      </div>

      <button type="button" className="new-chat" onClick={onNewChat}>
        <Plus size={15} /> New chat <kbd className="kbd">⌘N</kbd>
      </button>

      <label className="search-box">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
        />
        <kbd className="kbd">⌘K</kbd>
      </label>

      <div className="side-scroll">
        {pinned.length ? (
          <>
            <p className="side-label">
              Pinned <Pin size={10} />
            </p>
            {pinned.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={view.name === 'chat' && view.id === chat.id}
                onClick={() => onNavigate({ name: 'chat', id: chat.id })}
                onPin={() => togglePin(chat.id)}
              />
            ))}
          </>
        ) : null}

        {groups.map((group) => (
          <div key={group.label}>
            <p className="side-label">{group.label}</p>
            {group.chats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={view.name === 'chat' && view.id === chat.id}
                onClick={() => onNavigate({ name: 'chat', id: chat.id })}
                onPin={() => togglePin(chat.id)}
              />
            ))}
          </div>
        ))}

        {!filtered.length ? <p className="side-empty">No chat matches “{query}”.</p> : null}

        <button type="button" className="side-label side-label-btn" onClick={() => setToolsOpen((value) => !value)}>
          Tools <ChevronDown size={11} className={cn('chev', !toolsOpen && 'chev-closed')} />
        </button>
        {toolsOpen ? (
          <div className="tool-links">
            {toolLinks.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn('tool-link', view.name === item.view.name && 'is-active')}
                  onClick={() => onNavigate(item.view)}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                  <span className="tool-count">{counts[item.key]}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={cn('tool-link', view.name === 'integrations' && 'is-active')}
              onClick={() => onNavigate({ name: 'integrations' })}
            >
              <MessagesSquare size={14} />
              <span>Integrations</span>
              <ArrowUpRight size={12} className="tool-arrow" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="side-foot">
        <div className="usage-mini">
          <span className="mono">{money(4.12)} <span className="faint">of $25</span></span>
          <span className="tiny faint">91% fast-path</span>
        </div>
        <ProfileMenu onNavigate={onNavigate} onShortcuts={onShortcuts} />
      </div>
    </aside>
  )
}

function ChatRow({
  chat,
  active,
  onClick,
  onPin,
}: {
  chat: Chat
  active: boolean
  onClick: () => void
  onPin: () => void
}) {
  return (
    <div className={cn('chat-row', active && 'is-active')}>
      <button type="button" className="chat-row-main" onClick={onClick} aria-current={active ? 'page' : undefined}>
        <span className="chat-row-title">{chat.title}</span>
        <span className="chat-row-meta">
          {chat.status === 'waiting' ? (
            <StatusPill label="needs you" tone="amber" />
          ) : chat.status === 'running' ? (
            <StatusPill label="running" tone="blue" live />
          ) : (
            <span className="chat-time">{chat.updated}</span>
          )}
          {chat.status !== 'idle' ? <span className="chat-time">{chat.updated}</span> : null}
        </span>
      </button>
      <button
        type="button"
        className="chat-pin"
        onClick={onPin}
        aria-label={chat.pinned ? 'Unpin chat' : 'Pin chat'}
        title={chat.pinned ? 'Unpin' : 'Pin'}
      >
        <Pin size={12} className={chat.pinned ? 'pinned' : ''} />
      </button>
    </div>
  )
}

function groupChats(chats: Chat[]): Array<{ label: string; chats: Chat[] }> {
  const order = ['Today', 'Yesterday', 'Earlier']
  return order
    .map((label) => ({ label, chats: chats.filter((chat) => chat.createdAt === label) }))
    .filter((group) => group.chats.length > 0)
}
