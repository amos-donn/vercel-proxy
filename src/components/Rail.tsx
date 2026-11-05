import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronDown,
  FolderClosed,
  Frame,
  Home,
  KeyRound,
  ListChecks,
  MessagesSquare,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useStore } from '../store'
import type { Chat, View } from '../types'
import { cn, money } from '../lib/format'
import { ProfileMenu } from './ProfileMenu'
import { StatusPill } from './ui'

/**
 * The single workspace sidebar: brand, navigation with readable names, the
 * chat list and the account menu. There used to be an icon rail plus a second
 * column; this is both of them, in one place.
 */

const primary: Array<{ view: View; label: string; icon: typeof Home }> = [
  { view: { name: 'home' }, label: 'Home', icon: Home },
  { view: { name: 'chats' }, label: 'Chats', icon: MessagesSquare },
  { view: { name: 'agents' }, label: 'Agents', icon: Bot },
]

type CountKey = 'files' | 'canvas' | 'keys' | 'jobs' | 'media' | 'automations' | 'skills'

const tools: Array<{ view: View; label: string; icon: typeof Home; key?: CountKey }> = [
  { view: { name: 'files' }, label: 'Files', icon: FolderClosed, key: 'files' },
  { view: { name: 'canvas' }, label: 'Canvas', icon: Frame, key: 'canvas' },
  { view: { name: 'vault' }, label: 'Vault', icon: KeyRound, key: 'keys' },
  { view: { name: 'skills' }, label: 'Skills', icon: BookOpen, key: 'skills' },
  { view: { name: 'media' }, label: 'Media', icon: Sparkles, key: 'media' },
  { view: { name: 'automations' }, label: 'Automations', icon: Timer, key: 'automations' },
  { view: { name: 'jobs' }, label: 'Jobs', icon: ListChecks, key: 'jobs' },
  { view: { name: 'integrations' }, label: 'Integrations', icon: ArrowUpRight },
]

export function Rail({
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
  const { chats, files, canvases, keys, skills, jobs, media, automations, usage, togglePin } = useStore()
  const [query, setQuery] = useState('')
  const [toolsOpen, setToolsOpen] = useState(true)

  const counts: Record<CountKey, number> = {
    files: files.length,
    canvas: canvases.length,
    keys: keys.length,
    jobs: jobs.filter((job) => job.state !== 'succeeded').length,
    media: media.length,
    automations: automations.filter((item) => item.enabled).length,
    skills: skills.filter((item) => item.enabled).length,
  }

  const active = (name: View['name']) =>
    view.name === name || (view.name === 'chat' && name === 'chats')

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
  const groups = useMemo(() => groupChats(filtered.filter((chat) => !chat.pinned)), [filtered])

  return (
    <nav className="rail" aria-label="Workspace">
      <div className="ws">
        <div className="ws-mark">M</div>
        <div className="ws-copy">
          <span className="ws-name">Mezze</span>
          <span className="ws-plan">personal workspace</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Settings"
          onClick={() => onNavigate({ name: 'settings' })}
        >
          <Settings size={14} />
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

      <div className="rail-nav">
        {primary.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              className={cn('tool-link', active(item.view.name) && 'is-active')}
              onClick={() => onNavigate(item.view)}
              aria-current={active(item.view.name) ? 'page' : undefined}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

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

        {!filtered.length ? (
          <p className="side-empty">
            {chats.length ? `No chat matches “${query}”.` : 'No chats yet. Ask the workspace for something.'}
          </p>
        ) : null}

        <button
          type="button"
          className="side-label side-label-btn"
          onClick={() => setToolsOpen((value) => !value)}
        >
          Workspace <ChevronDown size={11} className={cn('chev', !toolsOpen && 'chev-closed')} />
        </button>
        {toolsOpen ? (
          <div className="tool-links">
            {tools.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn('tool-link', view.name === item.view.name && 'is-active')}
                  onClick={() => onNavigate(item.view)}
                  aria-current={view.name === item.view.name ? 'page' : undefined}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                  {item.key ? <span className="tool-count">{counts[item.key]}</span> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="side-foot">
        <div className="usage-mini">
          <span className="mono">
            {money(usage.spend)} <span className="faint">this workspace</span>
          </span>
          <span className="tiny faint">
            {usage.decisions ? `${usage.fastPath}% fast-path` : 'no decisions yet'}
          </span>
        </div>
        <ProfileMenu onNavigate={onNavigate} onShortcuts={onShortcuts} />
      </div>
    </nav>
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
