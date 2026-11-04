export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

export const money = (n: number): string =>
  n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`

export const tokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

export const pct = (n: number): string => `${Math.round(n)}%`

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const uid = (prefix = 'ev'): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

export const splitWords = (text: string): string[] => text.match(/\S+\s*/g) ?? [text]

export const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : bytes >= 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${bytes} B`

export const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export const countdown = (ms: number): string => {
  if (ms <= 0) return 'now'
  const total = Math.ceil(ms / 1000)
  return total >= 60 ? `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s` : `${total}s`
}
