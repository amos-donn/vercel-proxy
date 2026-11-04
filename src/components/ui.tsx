import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../lib/format'
import type { Tone } from '../types'

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return <span className={cn('chip', `chip-${tone}`, className)}>{children}</span>
}

export function StatusPill({
  label,
  tone = 'neutral',
  live = false,
}: {
  label: string
  tone?: Tone
  live?: boolean
}) {
  return (
    <span className={cn('status-pill', `tone-${tone}`)}>
      <span className={cn('dot', live && 'dot-live')} />
      {label}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Meter({
  value,
  tone = 'lime',
  label,
}: {
  value: number
  tone?: Tone
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('meter', `meter-${tone}`)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('toggle-row', disabled && 'is-disabled')}>
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn('switch', checked && 'is-on')}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('segmented', size === 'sm' && 'segmented-sm')} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cn('segmented-item', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          className={cn('tab', tab.id === value && 'is-active')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  if (!open) return null
  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function CheckRow({
  checked,
  onChange,
  label,
  note,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  note?: string
}) {
  return (
    <label className="check-row">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        className={cn('check-box', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </button>
      <span>
        <span className="check-label">{label}</span>
        {note ? <span className="check-note">{note}</span> : null}
      </span>
    </label>
  )
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon ? <span className="empty-icon">{icon}</span> : null}
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  )
}
