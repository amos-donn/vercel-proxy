import { useMemo, useRef, useState } from 'react'
import {
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useStore } from '../store'
import type { WorkspaceFile } from '../types'
import { fileSize } from '../lib/format'
import { Chip, Empty, Field, Meter, Modal } from '../components/ui'

const allowedRoots = ['memory', 'reports', 'drafts', 'plans', 'data', 'runs', 'transcripts', 'uploads', 'jobs', 'docs']

export function FilesPage() {
  const { files, writeFile, deleteFile, notify } = useStore()
  const [selectedPath, setSelectedPath] = useState('reports/billing-weekly.md')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'preview' | 'raw'>('preview')
  const [newOpen, setNewOpen] = useState(false)
  const [newPath, setNewPath] = useState('drafts/')
  const [newText, setNewText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const file = files.find((item) => item.path === selectedPath) ?? files[0]
  const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter(
      (item) => item.path.toLowerCase().includes(q) || item.text?.toLowerCase().includes(q),
    )
  }, [files, query])

  const groups = useMemo(() => {
    const map = new Map<string, WorkspaceFile[]>()
    for (const item of filtered) {
      const dir = item.path.includes('/') ? item.path.split('/')[0] : 'root'
      map.set(dir, [...(map.get(dir) ?? []), item])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const pathValid =
    allowedRoots.some((root) => newPath.startsWith(`${root}/`)) &&
    !newPath.includes('..') &&
    newPath.split('/').pop() !== ''

  const create = () => {
    if (!pathValid) return
    writeFile(newPath, newText || `# ${newPath.split('/').pop()}\n\n`, 'user')
    setSelectedPath(newPath)
    setNewOpen(false)
    setNewText('')
    setNewPath('drafts/')
    notify(`Created ${newPath}`)
  }

  const upload = (uploaded: File) => {
    const path = `uploads/${uploaded.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      writeFile(path, text.slice(0, 400_000), 'user')
      setSelectedPath(path)
      notify(`${uploaded.name} added to uploads/`)
    }
    reader.readAsText(uploaded)
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(`${label} copied`)
    } catch {
      notify('Clipboard is blocked in this browser')
    }
  }

  const download = () => {
    if (!file) return
    const blob = new Blob([file.text ?? ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.path.split('/').pop() ?? 'file.txt'
    link.click()
    URL.revokeObjectURL(url)
    notify(`Downloaded ${file.path}`)
  }

  return (
    <div className="page page-files">
      <header className="page-head">
        <div>
          <h1>Files</h1>
          <p>
            The workspace filesystem. Paths are validated, writes are atomic, and every agent read is
            scoped to the roots below.
          </p>
        </div>
        <div className="head-actions">
          <input
            ref={uploadRef}
            type="file"
            hidden
            onChange={(event) => {
              const uploaded = event.target.files?.[0]
              if (uploaded) upload(uploaded)
              event.target.value = ''
            }}
          />
          <button type="button" className="btn" onClick={() => uploadRef.current?.click()}>
            <Upload size={13} /> Upload
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
            <FilePlus2 size={13} /> New file
          </button>
        </div>
      </header>

      <div className="usage-strip">
        <span className="mono">{files.length} files · {fileSize(totalBytes)}</span>
        <Meter value={(totalBytes / 5_000_000) * 100} tone="lime" label="Workspace usage" />
        <span className="tiny faint">in-memory · resets when the tab closes</span>
      </div>

      <div className="files-layout">
        <aside className="file-tree">
          <label className="search-box search-box-inline">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search paths and content"
              aria-label="Search files"
            />
          </label>

          <div className="tree-scroll">
            {groups.map(([dir, items]) => (
              <div key={dir} className="tree-group">
                <p className="tree-folder">
                  <Folder size={12} /> {dir === 'root' ? 'workspace' : dir}
                  <span className="tree-count">{items.length}</span>
                </p>
                {items.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`tree-row ${file?.path === item.path ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedPath(item.path)
                      setConfirmDelete(false)
                    }}
                  >
                    <FileText size={12} />
                    <span className="tree-name">{item.path.split('/').slice(1).join('/') || item.path}</span>
                    {item.origin === 'user' ? <span className="tree-dot" title="Added by you" /> : null}
                  </button>
                ))}
              </div>
            ))}
            {!filtered.length ? <p className="tree-empty">No path or content matches “{query}”.</p> : null}
          </div>

          <footer className="tree-foot">
            <span className="mono tiny">root</span>
            <span className="tiny faint">write: allowed</span>
            <span className="tiny faint">delete: gated</span>
          </footer>
        </aside>

        <section className="file-view">
          {file ? (
            <>
              <header className="file-toolbar">
                <div className="file-title">
                  <span className="mono">{file.path}</span>
                  <span className="file-tags">
                    <Chip tone={file.origin === 'user' ? 'blue' : 'lime'}>{file.origin}</Chip>
                    <Chip tone="neutral">{fileSize(file.bytes)}</Chip>
                    <span className="tiny faint">{file.updated}</span>
                  </span>
                </div>
                <div className="file-actions">
                  <div className="segmented segmented-sm">
                    <button
                      type="button"
                      className={`segmented-item ${view === 'preview' ? 'is-active' : ''}`}
                      onClick={() => setView('preview')}
                    >
                      <Eye size={11} /> Preview
                    </button>
                    <button
                      type="button"
                      className={`segmented-item ${view === 'raw' ? 'is-active' : ''}`}
                      onClick={() => setView('raw')}
                    >
                      Raw
                    </button>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => copy(file.path, 'Path')} aria-label="Copy path">
                    <Copy size={14} />
                  </button>
                  <button type="button" className="icon-btn" onClick={download} aria-label="Download file">
                    <Download size={14} />
                  </button>
                  {confirmDelete ? (
                    <span className="confirm-inline">
                      sure?
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => {
                          deleteFile(file.path)
                          setConfirmDelete(false)
                          setSelectedPath(files.find((item) => item.path !== file.path)?.path ?? '')
                          notify(`Deleted ${file.path}`)
                        }}
                      >
                        delete
                      </button>
                      <button type="button" className="link-btn" onClick={() => setConfirmDelete(false)}>
                        cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="icon-btn danger" onClick={() => setConfirmDelete(true)} aria-label="Delete file">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </header>

              <div className="file-preview">
                {view === 'raw' || !file.path.endsWith('.md') ? (
                  <pre className="raw-preview">{file.text ?? '(binary or empty file)'}</pre>
                ) : (
                  <div className="md">
                    {(file.text ?? '').split('\n').map((line, index) => {
                      if (line.startsWith('# ')) return <h2 key={index}>{line.slice(2)}</h2>
                      if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>
                      if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>
                      if (line.startsWith('- ')) return <div key={index} className="md-li">• {line.slice(2)}</div>
                      if (!line.trim()) return <div key={index} className="md-gap" />
                      return <p key={index}>{line}</p>
                    })}
                  </div>
                )}
              </div>

              <footer className="file-meta">
                <span className="mono">{file.bytes.toLocaleString()} bytes</span>
                <span>sha in memory only</span>
                <span className="grow" />
                <span className="tiny faint">Path traversal, dotfiles and symlinks are rejected before write.</span>
              </footer>
            </>
          ) : (
            <Empty icon={<FileText size={18} />} title="No file selected">
              Pick a file on the left, or create one. Agents can only write inside the allowed roots.
            </Empty>
          )}
        </section>
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New file"
        subtitle="Creates a real file in this session. Nothing is persisted after the tab closes."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setNewOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!pathValid} onClick={create}>
              Create file
            </button>
          </>
        }
      >
        <Field label="Path" hint={`Allowed roots: ${allowedRoots.join(', ')}`} htmlFor="new-path">
          <input
            id="new-path"
            className="input mono"
            value={newPath}
            onChange={(event) => setNewPath(event.target.value.trim())}
          />
        </Field>
        {!pathValid ? <p className="field-error">Use one of the allowed roots, e.g. drafts/notes.md</p> : null}
        <Field label="Starting content" htmlFor="new-body">
          <textarea
            id="new-body"
            className="textarea mono"
            rows={6}
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
            placeholder="# Title"
          />
        </Field>
      </Modal>
    </div>
  )
}
