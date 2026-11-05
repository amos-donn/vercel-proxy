import type { ElementType, ReactNode } from 'react'

/**
 * Markdown for agent replies.
 *
 * Everything is turned into React elements instead of an HTML string: model
 * output is untrusted text, so nothing is ever injected with innerHTML. Unknown
 * syntax is rendered verbatim, which also keeps half-streamed replies readable.
 */

type ListItem = { content: string; children: Block[] }

type Block =
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'heading'; depth: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const INLINE =
  /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"'`]+)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+)\*|_([^_\n]+)_/g

export function Markdown({ text }: { text: string }) {
  return <div className="rich">{renderBlocks(parseBlocks(text.split(/\r?\n/)), 'md')}</div>
}

function indentOf(line: string): number {
  return line.replace(/\t/g, '  ').match(/^\s*/)?.[0].length ?? 0
}

function isTableDivider(line: string): boolean {
  return line.includes('|') && line.includes('-') && /^[\s|:-]+$/.test(line)
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index]
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1]))
  )
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const close = fence[1].startsWith('`') ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/
      const body: string[] = []
      i += 1
      while (i < lines.length && !close.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push({ kind: 'code', lang: fence[2] ?? '', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', depth: heading[1].length, text: heading[2] })
      i += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'hr' })
      i += 1
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length) {
        const quote = QUOTE.exec(lines[i])
        if (!quote) break
        body.push(quote[1])
        i += 1
      }
      blocks.push({ kind: 'quote', text: body.join('\n') })
      continue
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const list = parseList(lines, i)
      blocks.push(list.block)
      i = list.next
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const head = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push({ kind: 'table', head, rows })
      continue
    }

    const body: string[] = [line.trim()]
    i += 1
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      body.push(lines[i].trim())
      i += 1
    }
    blocks.push({ kind: 'paragraph', text: body.join('\n') })
  }

  return blocks
}

function parseList(lines: string[], startIndex: number): { block: Block; next: number } {
  const first = ORDERED.exec(lines[startIndex])
  const ordered = Boolean(first)
  const baseIndent = indentOf(lines[startIndex])
  const start = first ? Number(first[2]) : 1
  const items: ListItem[] = []
  let i = startIndex

  while (i < lines.length) {
    const bullet = BULLET.exec(lines[i])
    const orderedItem = ORDERED.exec(lines[i])
    // A different marker type at the same depth starts a new list.
    if (indentOf(lines[i]) !== baseIndent || (ordered ? !orderedItem : !bullet)) break

    const content = bullet ? bullet[2] : orderedItem?.[3] ?? ''
    i += 1
    const nested: string[] = []

    while (i < lines.length) {
      const next = lines[i]
      if (!next.trim()) {
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j += 1
        if (j < lines.length && indentOf(lines[j]) > baseIndent) {
          nested.push('')
          i += 1
          continue
        }
        i = j
        break
      }
      if (indentOf(next) > baseIndent) {
        nested.push(next.trim())
        i += 1
        continue
      }
      if (BULLET.test(next) || ORDERED.test(next) || startsBlock(lines, i)) break
      nested.push(next.trim())
      i += 1
    }

    items.push({ content, children: nested.length ? parseBlocks(nested) : [] })
    if (i < lines.length && (ordered ? !ORDERED.test(lines[i]) : !BULLET.test(lines[i]))) break
  }

  return { block: { kind: 'list', ordered, start, items }, next: i }
}

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`
    switch (block.kind) {
      case 'code':
        return (
          <pre key={key} className="rich-pre">
            {block.lang ? <span className="rich-lang mono">{block.lang}</span> : null}
            <code>{block.text}</code>
          </pre>
        )
      case 'heading': {
        const level = Math.min(block.depth + 2, 6)
        const Tag = `h${level}` as ElementType
        return (
          <Tag key={key} className="rich-heading">
            {inline(block.text, key)}
          </Tag>
        )
      }
      case 'paragraph':
        return (
          <p key={key} className="rich-p">
            {inline(block.text, key)}
          </p>
        )
      case 'quote':
        return (
          <blockquote key={key} className="rich-quote">
            {renderBlocks(parseBlocks(block.text.split('\n')), key)}
          </blockquote>
        )
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={`${key}-${itemIndex}`}>
            {inline(item.content, `${key}-${itemIndex}`)}
            {item.children.length ? renderBlocks(item.children, `${key}-${itemIndex}`) : null}
          </li>
        ))
        return block.ordered ? (
          <ol key={key} className="rich-list" start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={key} className="rich-list">
            {items}
          </ul>
        )
      }
      case 'table':
        return (
          <div key={key} className="rich-table-wrap">
            <table className="rich-table">
              <thead>
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th key={cellIndex}>{inline(cell, `${key}-h${cellIndex}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{inline(cell, `${key}-${rowIndex}-${cellIndex}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'hr':
        return <hr key={key} className="rich-hr" />
    }
  })
}

function safeHref(href: string): string | null {
  const url = href.trim()
  if (!url) return null
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url
  if (url.startsWith('#') || url.startsWith('/')) return url
  // Anything else (javascript:, data:) is rendered as plain text.
  return null
}

function linkNode(text: string, href: string, key: string): ReactNode {
  const safe = safeHref(href)
  if (!safe) return <span key={key}>{text}</span>
  const external = /^https?:/i.test(safe)
  return (
    <a
      key={key}
      href={safe}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {/* Link text stays literal: re-parsing it would let a bare URL match itself forever. */}
      {text}
    </a>
  )
}

function textNodes(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split('\n')
    .flatMap((line, index) => (index === 0 ? [line] : [<br key={`${keyPrefix}-br${index}`} />, line]))
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = new RegExp(INLINE.source, 'g')
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(...textNodes(text.slice(last, match.index), `${keyPrefix}-t${nodes.length}`))
    const key = `${keyPrefix}-${match.index}`
    const [, code, linkText, linkHref, bare, boldA, boldB, strike, emA, emB] = match

    if (code !== undefined) {
      nodes.push(<code key={key}>{code}</code>)
    } else if (linkText !== undefined && linkHref !== undefined) {
      nodes.push(linkNode(linkText, linkHref, key))
    } else if (bare !== undefined) {
      const trailing = /[.,;:!?)]+$/.exec(bare)?.[0] ?? ''
      const href = trailing ? bare.slice(0, -trailing.length) : bare
      nodes.push(linkNode(href, href, key))
      if (trailing) nodes.push(trailing)
    } else if (boldA !== undefined || boldB !== undefined) {
      nodes.push(<strong key={key}>{inline(boldA ?? boldB ?? '', key)}</strong>)
    } else if (strike !== undefined) {
      nodes.push(<del key={key}>{inline(strike, key)}</del>)
    } else if (emA !== undefined || emB !== undefined) {
      nodes.push(<em key={key}>{inline(emA ?? emB ?? '', key)}</em>)
    }
    last = pattern.lastIndex
  }

  if (last < text.length) nodes.push(...textNodes(text.slice(last), `${keyPrefix}-end`))
  return nodes
}
