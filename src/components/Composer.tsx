import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Paperclip,
  Plug,
  Sparkles,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { modelLabel } from '../data/providers'
import type { Agent, McpServer, McpToolCall, Skill } from '../types'
import { cn } from '../lib/format'
import { coerceToolArgs, toolFields } from '../lib/mcp'
import { Field, Modal, Segmented } from './ui'

export type ComposerMode = 'auto' | 'research' | 'write' | 'canvas'

const HOUR = 60 * 60 * 1000

function tomorrowNine(): number {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.getTime()
}

function clockLabel(at: number): string {
  const date = new Date(at)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function localInputValue(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function Composer({
  variant = 'thread',
  placeholder = 'Message the workspace…',
  disabled = false,
  autoFocus = false,
  mode,
  onModeChange,
  think,
  onThinkChange,
  agent,
  onSubmit,
  onOpenIntegrations,
}: {
  variant?: 'hero' | 'thread'
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  mode: ComposerMode
  onModeChange: (mode: ComposerMode) => void
  think: boolean
  onThinkChange: (think: boolean) => void
  agent?: Agent
  onSubmit: (
    text: string,
    attachments: string[],
    skills: Skill[],
    toolCalls: McpToolCall[],
    scheduleAt?: number,
  ) => void
  onOpenIntegrations?: () => void
}) {
  const { files, skills: allSkills, mcpServers, writeFile, notify, settings } = useStore()
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [skillIds, setSkillIds] = useState<string[]>([])
  const [toolCalls, setToolCalls] = useState<McpToolCall[]>([])
  const [slash, setSlash] = useState<{ open: boolean; query: string }>({ open: false, query: '' })
  const [slashIndex, setSlashIndex] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customAt, setCustomAt] = useState(() => localInputValue(Date.now() + HOUR))
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const scheduleRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const availableSkills = allSkills.filter((skill) => skill.enabled)
  const selected = skillIds
    .map((id) => allSkills.find((skill) => skill.id === id))
    .filter((skill): skill is Skill => Boolean(skill))
  const matches = slash.open
    ? availableSkills.filter((skill) => {
        const q = slash.query.toLowerCase()
        return !q || skill.slug.includes(q) || skill.name.toLowerCase().includes(q)
      })
    : []
  const empty = !value.trim() && !toolCalls.length

  useEffect(() => {
    if (!scheduleOpen) return
    const close = (event: MouseEvent) => {
      if (!scheduleRef.current?.contains(event.target as Node)) setScheduleOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [scheduleOpen])

  const submit = (scheduleAt?: number) => {
    const text = value.trim()
    if ((!text && !toolCalls.length) || disabled) return
    onSubmit(
      text || 'Run the attached MCP tool and summarise the result.',
      attachments,
      selected,
      toolCalls,
      scheduleAt,
    )
    setValue('')
    setAttachments([])
    setSkillIds([])
    setToolCalls([])
    setSlash({ open: false, query: '' })
    setScheduleOpen(false)
  }

  const attach = (file: File) => {
    const path = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      writeFile(path, text.slice(0, 400_000), 'user')
      setAttachments((prev) => [...prev, path])
      notify(`${file.name} added to uploads/`)
      if (file.size > 400_000) notify(`${file.name} preview clipped to 400 KB`)
    }
    reader.readAsText(file)
  }

  const insertSkill = (skill: Skill) => {
    setSkillIds((prev) => (prev.includes(skill.id) ? prev : [...prev, skill.id]))
    setValue((prev) => prev.replace(/(^|\s)\/[a-z0-9-]*$/i, '$1').replace(/\s+$/, ' '))
    setSlash({ open: false, query: '' })
    setSlashIndex(0)
    inputRef.current?.focus()
  }

  const onChange = (next: string) => {
    setValue(next)
    const match = /(?:^|\s)\/([a-z0-9-]*)$/i.exec(next)
    if (match) {
      setSlash({ open: true, query: match[1] ?? '' })
      setSlashIndex(0)
    } else if (slash.open) {
      setSlash({ open: false, query: '' })
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashIndex((index) => Math.min(Math.max(0, matches.length - 1), index + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashIndex((index) => Math.max(0, index - 1))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSlash({ open: false, query: '' })
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && matches.length) {
        event.preventDefault()
        insertSkill(matches[Math.min(slashIndex, matches.length - 1)])
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const schedule = (at: number) => {
    if (at <= Date.now() + 30_000) {
      setScheduleError('Pick a time at least a minute from now.')
      return
    }
    setScheduleError(null)
    setCustomOpen(false)
    submit(at)
  }

  return (
    <div className={cn('composer', variant === 'hero' && 'composer-hero')}>
      {slash.open ? (
        <div className="slash-menu" role="listbox" aria-label="Skills">
          <div className="slash-head">
            <span>Attach a skill</span>
            <kbd className="kbd">esc</kbd>
          </div>
          {matches.length ? (
            matches.map((skill, index) => (
              <button
                key={skill.id}
                type="button"
                role="option"
                aria-selected={index === Math.min(slashIndex, matches.length - 1)}
                className={cn('slash-item', index === Math.min(slashIndex, matches.length - 1) && 'is-active')}
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertSkill(skill)
                }}
                onMouseEnter={() => setSlashIndex(index)}
              >
                <span className="slash-slug mono">/{skill.slug}</span>
                <span className="slash-copy">
                  <strong>{skill.name}</strong>
                  <span>{skill.description}</span>
                </span>
                <ChevronRight size={12} />
              </button>
            ))
          ) : (
            <p className="slash-empty">No skill matches “{slash.query}”. Add one in Skills.</p>
          )}
          <div className="slash-foot">
            <span>
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd> choose
            </span>
            <span>
              <kbd className="kbd">↵</kbd> attach
            </span>
          </div>
        </div>
      ) : null}

      {selected.length || toolCalls.length ? (
        <div className="attach-row token-row">
          {selected.map((skill) => (
            <span key={skill.id} className="token-chip token-skill">
              <Sparkles size={10} /> /{skill.slug}
              <button
                type="button"
                aria-label={`Remove skill ${skill.name}`}
                onClick={() => setSkillIds((prev) => prev.filter((id) => id !== skill.id))}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {toolCalls.map((call, index) => (
            <span key={`${call.serverId}-${call.tool}-${index}`} className="token-chip token-tool">
              <Plug size={10} /> {call.serverName} · {call.tool}
              <button
                type="button"
                aria-label={`Remove ${call.tool}`}
                onClick={() => setToolCalls((prev) => prev.filter((_, i) => i !== index))}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {attachments.length ? (
        <div className="attach-row">
          {attachments.map((path) => (
            <span key={path} className="attach-chip mono">
              <Paperclip size={10} /> {path.split('/').pop()}
              <button
                type="button"
                aria-label={`Remove ${path}`}
                onClick={() => setAttachments((prev) => prev.filter((item) => item !== path))}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        ref={inputRef}
        className="composer-input"
        placeholder={placeholder}
        value={value}
        rows={variant === 'hero' ? 3 : 2}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setSlash({ open: false, query: '' }), 120)}
        aria-label="Message"
      />

      <div className="composer-bar">
        <div className="composer-left">
          <button
            type="button"
            className="composer-icon"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a file"
            title="Attach a file to uploads/"
          >
            <Paperclip size={12} />
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) attach(file)
              event.target.value = ''
            }}
          />

          <button
            type="button"
            className={cn('composer-icon', selected.length > 0 && 'is-lit')}
            onClick={() => setSlash({ open: !slash.open, query: '' })}
            aria-label="Attach a skill"
            title="Attach a skill (or type /)"
          >
            <Sparkles size={12} />
          </button>

          <button
            type="button"
            className={cn('composer-icon', toolCalls.length > 0 && 'is-lit')}
            onClick={() => setPickerOpen(true)}
            aria-label="Attach an MCP tool call"
            title={
              mcpServers.some((server) => server.enabled && server.tools.length)
                ? 'Attach an MCP tool call'
                : 'Set up an MCP server in Integrations'
            }
          >
            <Plug size={12} />
          </button>

          <Segmented
            size="sm"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'research', label: 'Research' },
              { value: 'write', label: 'Write' },
              { value: 'canvas', label: 'Canvas' },
            ]}
          />

          <button
            type="button"
            className={cn('chip-btn', think && 'is-on')}
            aria-pressed={think}
            onClick={() => onThinkChange(!think)}
            title="Force System 2 on the next turn"
          >
            <Brain size={12} /> Think harder
          </button>
        </div>

        <div className="composer-right">
          <span className="composer-hint" title="System 1 decides, System 2 writes">
            <Sparkles size={11} />
            <span className="mono">{agent?.name ?? 'Forge'}</span>
            <span className="faint">·</span>
            <span className="mono">{modelLabel(settings.s2Model)}</span>
          </span>

          <div className="send-group" ref={scheduleRef}>
            <button
              type="button"
              className="send-btn"
              onClick={() => submit()}
              disabled={empty || disabled}
              aria-label="Send"
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className={cn('send-caret', scheduleOpen && 'is-open')}
              onClick={() => setScheduleOpen((open) => !open)}
              disabled={empty || disabled}
              aria-label="Schedule send"
              aria-haspopup="menu"
              aria-expanded={scheduleOpen}
              title="Schedule send"
            >
              <ChevronDown size={12} />
            </button>

            {scheduleOpen ? (
              <div className="send-menu" role="menu" aria-label="Schedule send">
                <p className="send-menu-head">
                  <CalendarClock size={11} /> Schedule send
                </p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => schedule(Date.now() + 15 * 60 * 1000)}
                >
                  In 15 minutes <span className="mono">{clockLabel(Date.now() + 15 * 60 * 1000)}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => schedule(Date.now() + HOUR)}>
                  In 1 hour <span className="mono">{clockLabel(Date.now() + HOUR)}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => schedule(tomorrowNine())}>
                  Tomorrow at 9:00 <span className="mono">{clockLabel(tomorrowNine())}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="send-menu-custom"
                  onClick={() => {
                    setCustomAt(localInputValue(Date.now() + HOUR))
                    setScheduleError(null)
                    setScheduleOpen(false)
                    setCustomOpen(true)
                  }}
                >
                  Pick a time… <ChevronRight size={11} />
                </button>
                <p className="send-menu-foot">Sends while Mezze is open.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {variant === 'hero' ? (
        <p className="composer-foot">
          {files.length} files in your workspace · type <kbd className="kbd">/</kbd> for a skill ·{' '}
          System 1 decides, System 2 writes
        </p>
      ) : null}

      <ToolPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        servers={mcpServers}
        onAttach={(call) => {
          setToolCalls((prev) => [...prev, call])
          setPickerOpen(false)
        }}
        onOpenIntegrations={onOpenIntegrations}
      />

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Schedule send"
        subtitle="The message is queued in this workspace and sent while Mezze is open."
        width={440}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setCustomOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const at = new Date(customAt).getTime()
                if (Number.isNaN(at)) {
                  setScheduleError('That time does not parse.')
                  return
                }
                schedule(at)
              }}
            >
              <CalendarClock size={12} /> Schedule
            </button>
          </>
        }
      >
        <Field label="Send at" htmlFor="schedule-at">
          <input
            id="schedule-at"
            className="input"
            type="datetime-local"
            value={customAt}
            min={localInputValue(Date.now() + 60_000)}
            onChange={(event) => setCustomAt(event.target.value)}
          />
        </Field>
        {scheduleError ? <p className="field-error">{scheduleError}</p> : null}
      </Modal>
    </div>
  )
}

function ToolPicker({
  open,
  onClose,
  servers,
  onAttach,
  onOpenIntegrations,
}: {
  open: boolean
  onClose: () => void
  servers: McpServer[]
  onAttach: (call: McpToolCall) => void
  onOpenIntegrations?: () => void
}) {
  const usable = servers.filter((server) => server.enabled && server.tools.length)
  const [serverId, setServerId] = useState(usable[0]?.id ?? '')
  const [toolName, setToolName] = useState('')
  const [query, setQuery] = useState('')
  const [args, setArgs] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const server = usable.find((item) => item.id === serverId) ?? usable[0]
  const tool = server?.tools.find((item) => item.name === toolName)
  const fields = tool ? toolFields(tool) : []
  const tools = (server?.tools ?? []).filter((item) => {
    const q = query.trim().toLowerCase()
    return !q || item.name.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q)
  })

  const attach = () => {
    if (!server || !tool) return
    const { args: parsed, error: invalid } = coerceToolArgs(fields, args)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    onAttach({ serverId: server.id, serverName: server.name, tool: tool.name, args: parsed })
    setToolName('')
    setQuery('')
    setArgs({})
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach an MCP tool call"
      subtitle="The Worker runs this before the turn and hands the result to System 2."
      width={580}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!tool} onClick={attach}>
            <Check size={12} /> Attach call
          </button>
        </>
      }
    >
      {!usable.length ? (
        <div className="inline-note">
          <p>
            <Plug size={12} /> No MCP server has tools yet. Add one in Integrations and refresh it.
          </p>
          {onOpenIntegrations ? (
            <button type="button" className="btn btn-sm" onClick={onOpenIntegrations}>
              Open Integrations <ChevronRight size={11} />
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <Field label="Server">
            <select
              className="input"
              value={server?.id ?? ''}
              onChange={(event) => {
                setServerId(event.target.value)
                setToolName('')
                setQuery('')
                setArgs({})
                setError(null)
              }}
            >
              {usable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.tools.length} tools
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tool" htmlFor="tool-search">
            <input
              id="tool-search"
              className="input"
              placeholder={`Search ${server?.tools.length ?? 0} tools…`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>

          <div className="tool-list">
            {tools.length ? (
              tools.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={cn('tool-list-item', item.name === toolName && 'is-active')}
                  onClick={() => {
                    setToolName(item.name)
                    setArgs({})
                    setError(null)
                  }}
                >
                  <span className="mono">{item.name}</span>
                  <span>{item.description || 'No description'}</span>
                </button>
              ))
            ) : (
              <p className="tiny faint">No tools match “{query}”.</p>
            )}
          </div>

          {tool?.description ? <p className="tool-picker-desc">{tool.description}</p> : null}

          {fields.map((field) => (
            <Field
              key={field.name}
              label={`${field.name}${field.required ? ' *' : ''}`}
              hint={field.description}
              htmlFor={`args-${field.name}`}
            >
              {field.kind === 'boolean' ? (
                <select
                  id={`args-${field.name}`}
                  className="input"
                  value={args[field.name] ?? ''}
                  onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                >
                  <option value="">unset</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  id={`args-${field.name}`}
                  className="input mono"
                  type={field.kind === 'number' ? 'number' : 'text'}
                  value={args[field.name] ?? ''}
                  onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  placeholder={field.kind === 'number' ? '0' : 'value'}
                />
              )}
            </Field>
          ))}

          {error ? <p className="field-error">{error}</p> : null}
          {tool ? (
            <p className="tiny faint">
              <Loader2 size={10} /> Arguments are sent as JSON to the server. Nothing runs until you send the message.
            </p>
          ) : null}
        </>
      )}
    </Modal>
  )
}
