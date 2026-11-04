import { useRef, useState } from 'react'
import { ArrowUp, Brain, Paperclip, Sparkles, X } from 'lucide-react'
import { useStore } from '../store'
import type { Agent } from '../types'
import { cn } from '../lib/format'
import { Segmented } from './ui'

export type ComposerMode = 'auto' | 'research' | 'write'

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
  onSubmit: (text: string, attachments: string[]) => void
}) {
  const { files, writeFile, notify, settings } = useStore()
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSubmit(text, attachments)
    setValue('')
    setAttachments([])
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

  return (
    <div className={cn('composer', variant === 'hero' && 'composer-hero')}>
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
        className="composer-input"
        placeholder={placeholder}
        value={value}
        rows={variant === 'hero' ? 3 : 2}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        aria-label="Message"
      />

      <div className="composer-bar">
        <div className="composer-left">
          <button
            type="button"
            className="composer-icon"
            onClick={() => inputRef.current?.click()}
            aria-label="Attach a file"
            title="Attach a file to uploads/"
          >
            <Paperclip size={12} />
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) attach(file)
              event.target.value = ''
            }}
          />

          <Segmented
            size="sm"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'research', label: 'Research' },
              { value: 'write', label: 'Write' },
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
            <span className="mono">{settings.s2Model}</span>
          </span>
          <button
            type="button"
            className="send-btn"
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="Send"
          >
            <ArrowUp size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {variant === 'hero' ? (
        <p className="composer-foot">
          {files.length} files in the workspace · System 1 handles the decisions, System 2 the prose ·
          no accounts, no storage in this pass
        </p>
      ) : null}
    </div>
  )
}
