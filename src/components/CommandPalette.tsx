import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Bot,
  FileText,
  FolderClosed,
  Frame,
  Home,
  KeyRound,
  ListChecks,
  MessagesSquare,
  Search,
  Settings,
  Sparkles,
  Timer,
  Wrench,
} from 'lucide-react'
import { useStore } from '../store'
import type { View } from '../types'
import { cn } from '../lib/format'

type Item = { id: string; label: string; hint: string; view: View; icon: typeof Home }

const pages: Array<{ name: View['name']; label: string; icon: typeof Home }> = [
  { name: 'home', label: 'Home', icon: Home },
  { name: 'chats', label: 'Chats', icon: MessagesSquare },
  { name: 'files', label: 'Files', icon: FolderClosed },
  { name: 'canvas', label: 'Canvas', icon: Frame },
  { name: 'vault', label: 'Vault', icon: KeyRound },
  { name: 'jobs', label: 'Jobs', icon: ListChecks },
  { name: 'media', label: 'Media', icon: Sparkles },
  { name: 'automations', label: 'Automations', icon: Timer },
  { name: 'integrations', label: 'Integrations', icon: Bot },
  { name: 'agents', label: 'Agents', icon: Wrench },
  { name: 'skills', label: 'Skills', icon: BookOpen },
  { name: 'settings', label: 'Settings', icon: Settings },
]

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  counts,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: View) => void
  counts: { chats: number; files: number; jobs: number }
}) {
  const { chats, files, jobs, skills } = useStore()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  const items = useMemo<Item[]>(() => {
    const pageItems: Item[] = pages.map((page) => ({
      id: `page_${page.name}`,
      label: page.label,
      hint: 'Go to',
      view: { name: page.name } as View,
      icon: page.icon,
    }))
    const chatItems: Item[] = chats.slice(0, 6).map((chat) => ({
      id: `chat_${chat.id}`,
      label: chat.title,
      hint: `${chat.pinned ? 'pinned · ' : ''}${chat.updated}`,
      view: { name: 'chat', id: chat.id },
      icon: MessagesSquare,
    }))
    const fileItems: Item[] = files.slice(0, 5).map((file) => ({
      id: `file_${file.path}`,
      label: file.path,
      hint: 'Open file',
      view: { name: 'files', path: file.path },
      icon: FileText,
    }))
    const skillItems: Item[] = skills.filter((skill) => skill.enabled).slice(0, 6).map((skill) => ({
      id: `skill_${skill.id}`,
      label: `/${skill.slug}`,
      hint: skill.name,
      view: { name: 'skills' },
      icon: Sparkles,
    }))
    const jobItems: Item[] = jobs.slice(0, 4).map((job) => ({
      id: `job_${job.id}`,
      label: job.title,
      hint: `${job.state.replace(/_/g, ' ')} · ${job.provider}`,
      view: { name: 'jobs' },
      icon: ListChecks,
    }))
    const all = [...pageItems, ...chatItems, ...skillItems, ...fileItems, ...jobItems]
    const q = query.trim().toLowerCase()
    if (!q) return all.slice(0, 16)
    return all.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(q))
  }, [chats, files, jobs, skills, query])

  useEffect(() => {
    if (index > items.length - 1) setIndex(Math.max(0, items.length - 1))
  }, [index, items.length])

  if (!open) return null

  const go = (item: Item | undefined) => {
    if (!item) return
    onNavigate(item.view)
    onClose()
  }

  return (
    <div className="palette-layer" role="presentation" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search chats, files, skills, or jump…"
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((value) => Math.min(items.length - 1, value + 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((value) => Math.max(0, value - 1))
              }
              if (event.key === 'Enter') go(items[index])
              if (event.key === 'Escape') onClose()
            }}
            aria-label="Search everything"
          />
          <span className="mono tiny faint">{counts.chats}c · {counts.files}f · {counts.jobs}j</span>
        </div>
        <div className="palette-list">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={cn('palette-item', i === index && 'is-selected')}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item)}
              >
                <Icon size={14} />
                <span className="palette-label">{item.label}</span>
                <span className="palette-hint">{item.hint}</span>
              </button>
            )
          })}
          {!items.length ? <p className="palette-empty">Nothing matches “{query}”.</p> : null}
        </div>
        <footer className="palette-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> open</span>
          <span className="palette-foot-right">Mezze · saved to D1 · ⌘K anywhere</span>
        </footer>
      </div>
    </div>
  )
}
