import { useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, MessagesSquare, Pin, Search, X } from 'lucide-react'
import { useStore } from '../store'
import type { View } from '../types'
import { Chip, Segmented, StatusPill } from '../components/ui'

type Filter = 'all' | 'pinned' | 'waiting'

export function ChatsPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { chats, scheduled, cancelScheduled } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return chats.filter((chat) => {
      if (filter === 'pinned' && !chat.pinned) return false
      if (filter === 'waiting' && chat.status !== 'waiting') return false
      if (!q) return true
      return (
        chat.title.toLowerCase().includes(q) ||
        chat.preview.toLowerCase().includes(q) ||
        chat.tags?.some((tag) => tag.includes(q))
      )
    })
  }, [chats, filter, query])

  const traces = chats.reduce(
    (sum, chat) => sum + chat.messages.filter((message) => message.kind === 'trace').length,
    0,
  )

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Chats</h1>
          <p>
            {chats.length} threads, {traces} typed decisions, one event log per run. Pinning only moves a
            chat, it does not add context.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => onNavigate({ name: 'home' })}>
          New chat
        </button>
      </header>

      <div className="toolbar">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'pinned', label: 'Pinned' },
            { value: 'waiting', label: 'Needs you' },
          ]}
        />
        <label className="search-box search-box-inline">
          <Search size={13} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter threads" />
        </label>
      </div>

      {scheduled.length ? (
        <section className="panel scheduled-panel">
          <header className="scheduled-panel-head">
            <span>
              <CalendarClock size={13} /> Scheduled sends
            </span>
            <span className="mono tiny faint">{scheduled.length} queued</span>
          </header>
          {scheduled.map((item) => {
            const target = chats.find((chat) => chat.id === item.chatId)
            return (
              <div key={item.id} className="scheduled-row">
                <span className="scheduled-time mono">
                  {new Date(item.sendAt).toLocaleString([], {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <span className="scheduled-text">{item.text.slice(0, 110)}</span>
                <span className="tiny faint">{target ? target.title : 'new chat'}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => cancelScheduled(item.id)}
                  aria-label="Cancel scheduled send"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
          <p className="scheduled-foot">Queued messages send while Mezze is open, then appear in their chat.</p>
        </section>
      ) : null}

      <div className="panel chat-table">
        {rows.map((chat) => (
          <button key={chat.id} type="button" className="chat-table-row" onClick={() => onNavigate({ name: 'chat', id: chat.id })}>
            <span className="chat-table-icon">
              <MessagesSquare size={14} />
            </span>
            <span className="chat-table-main">
              <span className="chat-table-title">
                {chat.title}
                {chat.pinned ? <Pin size={11} className="pinned" /> : null}
                {chat.tags?.map((tag) => <Chip key={tag} tone="neutral">{tag}</Chip>)}
              </span>
              <span className="chat-table-preview">{chat.preview}</span>
            </span>
            <span className="chat-table-meta">
              <span className="mono tiny">{chat.messages.length} items</span>
              <span className="tiny faint">{chat.updated}</span>
            </span>
            <span className="chat-table-status">
              {chat.status === 'waiting' ? (
                <StatusPill label="needs you" tone="amber" />
              ) : chat.status === 'running' ? (
                <StatusPill label="running" tone="blue" live />
              ) : (
                <StatusPill label="idle" tone="neutral" />
              )}
            </span>
            <ArrowRight size={14} className="row-arrow" />
          </button>
        ))}
        {!rows.length ? <p className="table-empty">No chats match that filter.</p> : null}
      </div>
    </div>
  )
}
