import { useEffect, useRef, useState } from 'react'
import {
  CircleAlert,
  Code2,
  Download,
  FileUp,
  Frame,
  Loader2,
  Maximize2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store'
import type { CanvasFile } from '../types'
import { cn } from '../lib/format'
import { Field, Modal } from '../components/ui'
import { simulateCanvas } from '../engine/canvas'
import { buildCanvasDoc, canvasFiles, filesToParts, languageOf } from '../engine/canvasDoc'

type Tab = 'preview' | string

interface Draft {
  name: string
  files: CanvasFile[]
}

const blankDraft = (name: string): Draft => ({
  name: name || 'Untitled canvas',
  files: [
    {
      path: 'index.html',
      language: 'html',
      content: `<main class="card">\n  <p class="kicker">new canvas</p>\n  <h1>${escapeHtml(name || 'Untitled canvas')}</h1>\n  <p class="lede">Edit the files on the left — the preview reloads as you type.</p>\n  <button id="hello" class="btn">Say hello</button>\n  <output id="out"></output>\n</main>`,
    },
    {
      path: 'styles.css',
      language: 'css',
      content: `:root { color-scheme: dark; --accent: #b8f24d; --line: #262b20; --muted: #9aa392; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; background: #0a0b09; color: #eef3e6; font-family: Inter, system-ui, sans-serif; }\n.card { width: min(520px, 100%); padding: 34px; border: 1px solid var(--line); border-radius: 18px; background: #12150f; }\n.kicker { margin: 0 0 10px; color: var(--accent); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; }\nh1 { margin: 0 0 12px; font-family: Georgia, serif; font-size: 34px; font-weight: 400; line-height: 1.05; }\n.lede { margin: 0 0 20px; color: var(--muted); font-size: 14px; line-height: 1.6; }\n.btn { padding: 9px 15px; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: #0b1204; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }\noutput { display: block; margin-top: 14px; color: var(--muted); font-size: 12px; }`,
    },
    {
      path: 'app.js',
      language: 'js',
      content: `document.getElementById('hello').addEventListener('click', () => {\n  document.getElementById('out').textContent = 'Hello from the sandbox.'\n})`,
    },
  ],
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

const toDraft = (canvas: { name: string; html: string; css: string; js: string; files?: CanvasFile[] }): Draft => ({
  name: canvas.name,
  files: canvasFiles(canvas),
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
  const [preview, setPreview] = useState(() => (selected ? buildCanvasDoc(selected) : ''))
  const [previewKey, setPreviewKey] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'blank' | 'landing' | 'dashboard' | 'todo'>('landing')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selected) return
    setDraft(toDraft(selected))
    setPreview(buildCanvasDoc(selected))
    setPreviewKey((key) => key + 1)
    setRuntimeError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt])

  // Surface canvas script errors instead of a silently blank preview.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: unknown; kind?: unknown; message?: unknown } | null
      if (!data || typeof data !== 'object' || data.source !== 'mezze-canvas') return
      if (data.kind === 'log') return
      setRuntimeError(
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'The canvas script threw an error.',
      )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Edits run automatically (debounced), so pasted code is live without a click.
  useEffect(() => {
    if (!selected) return
    const timer = window.setTimeout(() => {
      setRuntimeError(null)
      setPreview(buildCanvasDoc({ ...filesToParts(draft.files), files: draft.files }))
      setPreviewKey((key) => key + 1)
    }, 500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.files])

  const savedFiles = selected ? canvasFiles(selected) : []
  const dirty = Boolean(
    selected &&
      (draft.name !== selected.name || JSON.stringify(draft.files) !== JSON.stringify(savedFiles)),
  )
  const activeFile =
    tab === 'preview' ? undefined : draft.files.find((file) => file.path === tab) ?? draft.files[0]
  const bytes = draft.files.reduce((sum, file) => sum + file.content.length, 0)

  const run = () => {
    if (!selected) return
    store.patchCanvas(selected.id, {
      name: draft.name,
      files: draft.files,
      ...filesToParts(draft.files),
    })
    setRuntimeError(null)
    setPreview(buildCanvasDoc({ ...filesToParts(draft.files), files: draft.files }))
    setPreviewKey((key) => key + 1)
    store.notify('Canvas saved · sandbox reloaded')
  }

  const create = () => {
    const base =
      newKind === 'blank'
        ? blankDraft(newName)
        : toDraft(
            simulateCanvas(
              newKind === 'dashboard' ? 'dashboard' : newKind === 'todo' ? 'todo list' : newName || 'landing page',
            ),
          )
    const parts = filesToParts(base.files)
    const canvas = store.addCanvas({
      name: newName.trim() || base.name,
      description:
        'description' in base && typeof base.description === 'string'
          ? base.description
          : `A ${newKind} canvas`,
      files: base.files,
      ...parts,
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
      const name = (parts[0]?.name ?? 'imported').replace(/\.[^.]+$/, '')
      const canvasFilesIn: CanvasFile[] = parts.map((part) => ({
        path: part.name,
        language: languageOf(part.name),
        content: part.text.slice(0, 120_000),
      }))
      if (!canvasFilesIn.some((file) => file.language === 'html')) {
        const source = canvasFilesIn[0]
        canvasFilesIn.unshift({
          path: 'index.html',
          language: 'html',
          content: `<main class="card"><h1>${escapeHtml(name || 'Imported canvas')}</h1><pre>${escapeHtml(
            (source?.content ?? '').slice(0, 120_000),
          )}</pre></main>`,
        })
      }
      const split = filesToParts(canvasFilesIn)
      const canvas = store.addCanvas({
        name: name || 'Imported canvas',
        description: `Imported ${parts.length} file${parts.length === 1 ? '' : 's'}`,
        files: canvasFilesIn,
        ...split,
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
    const blob = new Blob([buildCanvasDoc({ ...filesToParts(draft.files), files: draft.files })], {
      type: 'text/html',
    })
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
            A real sandbox with multiple files. The agent writes the project, you edit any file, and the preview runs
            in an isolated iframe. Import HTML, CSS or JS to take it further.
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
            accept=".html,.htm,.css,.js,.json,.svg,.txt,.md,.mjs"
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
                      {canvas.origin === 'agent' ? 'agent' : 'you'} · {canvasFiles(canvas).length} files ·{' '}
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
                    {dirty ? 'unsaved · auto-runs' : 'saved'}
                  </span>
                </div>
                <div className="canvas-actions">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={download}>
                    <Download size={11} /> Download
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setDeleteOpen(true)} aria-label="Delete canvas">
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => void previewRef.current?.requestFullscreen?.()}
                    title="Expand the preview"
                  >
                    <Maximize2 size={11} /> Expand
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={run} title="Save and reload the preview">
                    <Play size={11} /> Run
                  </button>
                </div>
              </header>

              <div className="canvas-tabs" role="tablist" aria-label="Canvas view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'preview'}
                  className={cn('canvas-tab', tab === 'preview' && 'is-active')}
                  onClick={() => setTab('preview')}
                >
                  Preview
                </button>
                {draft.files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    role="tab"
                    aria-selected={tab === file.path}
                    className={cn('canvas-tab', 'canvas-file-tab', tab === file.path && 'is-active')}
                    onClick={() => setTab(file.path)}
                    title={file.path}
                  >
                    {file.path}
                  </button>
                ))}
                <span className="canvas-tabs-hint">
                  {draft.files.length} file{draft.files.length === 1 ? '' : 's'} · {dirty ? 'preview stale' : 'preview current'}
                </span>
              </div>

              {tab === 'preview' || !activeFile ? (
                <div className="canvas-preview" ref={previewRef}>
                  {runtimeError ? (
                    <div className="canvas-error" role="alert">
                      <CircleAlert size={12} />
                      <span>{runtimeError}</span>
                      <button type="button" onClick={() => setRuntimeError(null)} aria-label="Dismiss error">
                        ✕
                      </button>
                    </div>
                  ) : null}
                  <iframe
                    key={previewKey}
                    title={`${draft.name} preview`}
                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                    srcDoc={preview}
                  />
                </div>
              ) : (
                <textarea
                  className="canvas-code mono"
                  spellCheck={false}
                  wrap="off"
                  value={activeFile.content}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      files: prev.files.map((file) =>
                        file.path === activeFile.path ? { ...file, content: event.target.value } : file,
                      ),
                    }))
                  }
                  aria-label={`${activeFile.path} source`}
                />
              )}

              <footer className="canvas-foot">
                <span>
                  <Sparkles size={10} /> Edits run automatically · local files are inlined · opaque-origin sandbox: no
                  cookies, storage or workspace access.
                </span>
                <span className="mono">{bytes} bytes</span>
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
