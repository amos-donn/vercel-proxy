import { useEffect, useRef, useState } from 'react'
import {
  Code2,
  Download,
  FileUp,
  Frame,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store'
import type { Canvas } from '../types'
import { cn } from '../lib/format'
import { Field, Modal } from '../components/ui'
import { simulateCanvas } from '../engine/canvas'

type Tab = 'preview' | 'html' | 'css' | 'js'

interface Draft {
  name: string
  html: string
  css: string
  js: string
}

const blankDraft = (name: string): Draft => ({
  name: name || 'Untitled canvas',
  html: `<main class="card">\n  <p class="kicker">new canvas</p>\n  <h1>${escapeHtml(name || 'Untitled canvas')}</h1>\n  <p class="lede">Edit the HTML, CSS or JS, then press Run.</p>\n  <button id="hello" class="btn">Say hello</button>\n  <output id="out"></output>\n</main>`,
  css: `:root { color-scheme: dark; --accent: #b8f24d; --line: #262b20; --muted: #9aa392; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; background: #0a0b09; color: #eef3e6; font-family: Inter, system-ui, sans-serif; }\n.card { width: min(520px, 100%); padding: 34px; border: 1px solid var(--line); border-radius: 18px; background: #12150f; }\n.kicker { margin: 0 0 10px; color: var(--accent); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; }\nh1 { margin: 0 0 12px; font-family: Georgia, serif; font-size: 34px; font-weight: 400; line-height: 1.05; }\n.lede { margin: 0 0 20px; color: var(--muted); font-size: 14px; line-height: 1.6; }\n.btn { padding: 9px 15px; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: #0b1204; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }\noutput { display: block; margin-top: 14px; color: var(--muted); font-size: 12px; }`,
  js: `document.getElementById('hello').addEventListener('click', () => {\n  document.getElementById('out').textContent = 'Hello from the sandbox.'\n})`,
})

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })
}

function buildDoc(input: { html: string; css: string; js: string }): string {
  const css = input.css.replace(/<\/style/gi, '<\\/style')
  const js = input.js.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet" />
<style>${css}</style>
</head>
<body>
${input.html}
<script>${js}</script>
</body>
</html>`
}

const toDraft = (canvas: Canvas): Draft => ({
  name: canvas.name,
  html: canvas.html,
  css: canvas.css,
  js: canvas.js,
})

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'canvas'

export function CanvasPage({ initialId }: { initialId?: string }) {
  const store = useStore()
  const canvases = store.canvases
  const [selectedId, setSelectedId] = useState(initialId ?? canvases[0]?.id ?? '')
  const selected = canvases.find((canvas) => canvas.id === selectedId) ?? canvases[0]
  const [draft, setDraft] = useState<Draft>(() => (selected ? toDraft(selected) : blankDraft('')))
  const [tab, setTab] = useState<Tab>('preview')
  const [preview, setPreview] = useState(() => (selected ? buildDoc(selected) : ''))
  const [previewKey, setPreviewKey] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'blank' | 'landing' | 'dashboard' | 'todo'>('landing')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!selected) {
      setDraft(blankDraft(''))
      return
    }
    setDraft(toDraft(selected))
    setPreview(buildDoc(selected))
    setPreviewKey((key) => key + 1)
    setTab('preview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const dirty = Boolean(
    selected &&
      (draft.name !== selected.name ||
        draft.html !== selected.html ||
        draft.css !== selected.css ||
        draft.js !== selected.js),
  )

  const run = () => {
    if (!selected) return
    store.patchCanvas(selected.id, { ...draft })
    setPreview(buildDoc(draft))
    setPreviewKey((key) => key + 1)
    store.notify('Canvas updated · sandbox reloaded')
  }

  const create = () => {
    const base =
      newKind === 'blank'
        ? blankDraft(newName)
        : simulateCanvas(
            newKind === 'dashboard' ? 'dashboard' : newKind === 'todo' ? 'todo list' : newName || 'landing page',
          )
    const canvas = store.addCanvas({
      name: newName.trim() || base.name,
      description:
        'description' in base && typeof base.description === 'string'
          ? base.description
          : `A ${newKind} canvas`,
      html: base.html,
      css: base.css,
      js: base.js,
      origin: 'user',
    })
    setSelectedId(canvas.id)
    setNewOpen(false)
    setNewName('')
    store.notify('Canvas created')
  }

  const importFiles = async (files: File[]) => {
    if (!files.length) return
    setImporting(true)
    try {
      const parts = await Promise.all(
        files.map(async (file) => ({ name: file.name, text: await file.text() })),
      )
      const html = parts.find((part) => /\.html?$/i.test(part.name))
      const css = parts.find((part) => /\.css$/i.test(part.name))
      const js = parts.find((part) => /\.js$/i.test(part.name))
      const svg = parts.find((part) => /\.svg$/i.test(part.name))
      const text = parts.find((part) => /\.(md|txt|json)$/i.test(part.name))
      const name = (html?.name ?? parts[0]?.name ?? 'imported').replace(/\.[^.]+$/, '')
      const body =
        html?.text ??
        svg?.text ??
        (text
          ? `<main class="card"><pre>${escapeHtml(text.text.slice(0, 120_000))}</pre></main>`
          : '<main class="card"><h1>Imported canvas</h1></main>')
      const canvas = store.addCanvas({
        name: name || 'Imported canvas',
        description: `Imported ${parts.length} file${parts.length === 1 ? '' : 's'}`,
        html: body,
        css:
          css?.text ??
          (svg
            ? ''
            : ':root{color-scheme:dark}body{margin:0;padding:28px;background:#0a0b09;color:#eef3e6;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.7}pre{white-space:pre-wrap;word-break:break-word}'),
        js: js?.text ?? '',
        origin: 'user',
      })
      setSelectedId(canvas.id)
      store.notify(`Imported ${parts.length} file${parts.length === 1 ? '' : 's'} into Canvas`)
    } finally {
      setImporting(false)
    }
  }

  const download = () => {
    if (!selected) return
    const blob = new Blob([buildDoc(draft)], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug(draft.name)}.html`
    link.click()
    URL.revokeObjectURL(url)
    store.notify('Canvas downloaded as a single HTML file')
  }

  const remove = () => {
    if (!selected) return
    const next = canvases.filter((canvas) => canvas.id !== selected.id)
    store.deleteCanvas(selected.id)
    setSelectedId(next[0]?.id ?? '')
    setDeleteOpen(false)
    store.notify('Canvas deleted')
  }

  return (
    <div className="page page-canvas">
      <div className="page-head canvas-head">
        <div>
          <h1>Canvas</h1>
          <p>
            A real sandbox. The agent writes a page, you edit it, and the preview runs in an isolated iframe.
            Import HTML, CSS or JS to take it further.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-quiet" onClick={() => importRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 size={12} className="spin" /> : <FileUp size={12} />} Import
          </button>
          <input
            ref={importRef}
            type="file"
            multiple
            hidden
            accept=".html,.htm,.css,.js,.json,.svg,.txt,.md"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              void importFiles(files)
              event.target.value = ''
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={12} /> New canvas
          </button>
        </div>
      </div>

      {!canvases.length ? (
        <div className="canvas-empty">
          <span className="canvas-empty-icon">
            <Frame size={20} />
          </span>
          <h2>No canvases yet</h2>
          <p>Ask the agent for a page, or start one yourself and import code.</p>
          <div className="head-actions">
            <button type="button" className="btn btn-quiet" onClick={() => importRef.current?.click()}>
              <FileUp size={12} /> Import code
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
              <Plus size={12} /> New canvas
            </button>
          </div>
        </div>
      ) : (
        <div className="canvas-layout">
          <aside className="canvas-list">
            <div className="canvas-list-head">
              <span>{canvases.length} canvas{canvases.length === 1 ? '' : 'es'}</span>
              <button type="button" className="icon-btn" onClick={() => setNewOpen(true)} aria-label="New canvas">
                <Plus size={13} />
              </button>
            </div>
            <div className="canvas-list-scroll">
              {canvases.map((canvas) => (
                <button
                  key={canvas.id}
                  type="button"
                  className={cn('canvas-row', canvas.id === selected?.id && 'is-active')}
                  onClick={() => setSelectedId(canvas.id)}
                >
                  <span className="canvas-row-icon">
                    <Code2 size={12} />
                  </span>
                  <span className="canvas-row-copy">
                    <strong>{canvas.name}</strong>
                    <span>
                      {canvas.origin === 'agent' ? 'agent' : 'you'} ·{' '}
                      {new Date(canvas.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  {canvas.id === selected?.id && dirty ? <span className="canvas-dot" title="Unsaved changes" /> : null}
                </button>
              ))}
            </div>
            <div className="canvas-list-foot">
              <span className="mono">sandboxed iframe</span>
              <span className="dot dot-live" />
            </div>
          </aside>

          {selected ? (
            <section className="canvas-work">
              <header className="canvas-toolbar">
                <div className="canvas-name">
                  <input
                    className="canvas-name-input"
                    value={draft.name}
                    onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                    aria-label="Canvas name"
                    maxLength={64}
                  />
                  <span className={cn('canvas-state', dirty && 'is-dirty')}>
                    {dirty ? 'unedited run' : 'saved'}
                  </span>
                </div>
                <div className="canvas-actions">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={download}>
                    <Download size={11} /> Download
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setDeleteOpen(true)} aria-label="Delete canvas">
                    <Trash2 size={13} />
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={!dirty}>
                    <Play size={11} /> Run
                  </button>
                </div>
              </header>

              <div className="canvas-tabs" role="tablist" aria-label="Canvas view">
                {([
                  ['preview', 'Preview'],
                  ['html', 'HTML'],
                  ['css', 'CSS'],
                  ['js', 'JS'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={cn('canvas-tab', tab === id && 'is-active')}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
                <span className="canvas-tabs-hint">
                  {dirty ? 'changes not running yet' : 'preview is current'}
                </span>
              </div>

              {tab === 'preview' ? (
                <div className="canvas-preview">
                  <iframe
                    key={previewKey}
                    title={`${draft.name} preview`}
                    sandbox="allow-scripts allow-forms allow-modals allow-popups"
                    srcDoc={preview}
                  />
                </div>
              ) : (
                <textarea
                  className="canvas-code mono"
                  spellCheck={false}
                  wrap="off"
                  value={tab === 'html' ? draft.html : tab === 'css' ? draft.css : draft.js}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      [tab]: event.target.value,
                    }))
                  }
                  aria-label={`${tab} source`}
                />
              )}

              <footer className="canvas-foot">
                <span>
                  <Sparkles size={10} /> Opaque-origin sandbox: no cookies, storage or workspace access.
                </span>
                <span className="mono">{draft.html.length + draft.css.length + draft.js.length} bytes</span>
              </footer>
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New canvas"
        subtitle="Start blank or with a working page you can edit."
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setNewOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={create}>
              <Plus size={12} /> Create
            </button>
          </>
        }
      >
        <Field label="Name" htmlFor="canvas-name">
          <input
            id="canvas-name"
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Launch page"
            maxLength={64}
          />
        </Field>
        <Field label="Start from">
          <select className="input" value={newKind} onChange={(event) => setNewKind(event.target.value as typeof newKind)}>
            <option value="blank">Blank</option>
            <option value="landing">Landing page</option>
            <option value="dashboard">Dashboard</option>
            <option value="todo">Task board</option>
          </select>
        </Field>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this canvas?"
        subtitle="The code is removed from your workspace snapshot. This cannot be undone."
        width={420}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setDeleteOpen(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={remove}>
              <Trash2 size={12} /> Delete
            </button>
          </>
        }
      >
        <p className="inline-note">
          <Frame size={12} /> {selected?.name}
        </p>
      </Modal>
    </div>
  )
}
