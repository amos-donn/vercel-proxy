import { useState } from 'react'
import {
  Check,
  CircleAlert,
  Loader2,
  Lock,
  Play,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react'
import { useStore } from '../store'
import type { McpServer, McpTool, McpTransport } from '../types'
import { cn } from '../lib/format'
import { coerceToolArgs, toolFields } from '../lib/mcp'
import { Chip, Empty, Field, Modal, Toggle } from '../components/ui'

export function IntegrationsPage() {
  const {
    mcpServers,
    addServer,
    updateServer,
    removeServer,
    refreshServer,
    callTool,
    notify,
  } = useStore()

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [transport, setTransport] = useState<McpTransport>('streamable-http')
  const [auth, setAuth] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const selected = mcpServers.find((server) => server.id === selectedId)
  const connected = mcpServers.filter((server) => server.status === 'connected')
  const toolCount = mcpServers.reduce((sum, server) => sum + server.toolsCount, 0)

  const create = async () => {
    if (!name.trim() || !url.trim()) return
    setBusy(true)
    setError(null)
    try {
      const server = await addServer({
        name: name.trim(),
        url: url.trim(),
        transport,
        ...(auth.trim() ? { auth: auth.trim() } : {}),
      })
      setAddOpen(false)
      setName('')
      setUrl('')
      setAuth('')
      setSelectedId(server.id)
      notify(
        server.tools.length
          ? `${server.name} connected · ${server.tools.length} tools discovered`
          : `${server.name} saved · discovery found no tools`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reach that server.')
    } finally {
      setBusy(false)
    }
  }

  const refresh = async (server: McpServer) => {
    setRefreshing(server.id)
    try {
      const next = await refreshServer(server.id)
      notify(
        next.status === 'connected'
          ? `${next.name} · ${next.toolsCount} tools`
          : `${next.name} · ${next.error ?? 'discovery failed'}`,
      )
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Refresh failed')
    } finally {
      setRefreshing(null)
    }
  }

  return (
    <div className="page page-integrations">
      <header className="page-head">
        <div>
          <h1>Integrations</h1>
          <p>
            MCP servers give the agent a real tool surface. The Worker speaks streamable HTTP or SSE,
            discovers the tool list, and stores any bearer token encrypted beside your provider keys.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add MCP server
        </button>
      </header>

      <div className="toolbar">
        <span className="tiny faint">
          {connected.length} connected · {toolCount} tools discovered ·{' '}
          {mcpServers.filter((server) => server.enabled).length} exposed to the agent
        </span>
        <span className="tiny faint">attach a call from any composer with the plug button</span>
      </div>

      <div className="int-grid">
        {mcpServers.map((server) => (
          <button key={server.id} type="button" className="int-card" onClick={() => setSelectedId(server.id)}>
            <div className="int-card-head">
              <span className={cn('int-mark', server.status === 'connected' ? 'tone-lime' : server.status === 'error' ? 'tone-red' : 'tone-blue')}>
                {server.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="int-card-title">
                <strong>{server.name}</strong>
                <span className="tiny faint">
                  {server.transport} · {server.authSet ? 'token stored' : 'no token'}
                </span>
              </div>
              <StatusFor server={server} refreshing={refreshing === server.id} />
            </div>
            <p className="mono int-url">{server.url}</p>
            {server.error ? <p className="int-error">{server.error}</p> : null}
            <div className="int-card-foot">
              <span className="mono tiny">{server.toolsCount} tools</span>
              <span className="tiny faint">{server.enabled ? 'agent can call' : 'agent blocked'}</span>
              <span className="grow" />
              <span className="tiny faint">updated {new Date(server.updatedAt).toLocaleTimeString()}</span>
            </div>
          </button>
        ))}
        {!mcpServers.length ? (
          <Empty
            icon={<Plug size={18} />}
            title="No MCP servers yet"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
                <Plus size={13} /> Connect one
              </button>
            }
          >
            Add an HTTPS endpoint that speaks MCP over streamable HTTP or SSE.
          </Empty>
        ) : null}
      </div>

      <div className="int-note">
        <Lock size={13} />
        <div>
          <strong>Tokens are separate from provider keys</strong>
          <p>
            A bearer token is encrypted before it touches D1 and only decrypted for a discovery or tool
            call against that exact URL. Private and loopback endpoints are rejected unless the Worker
            runs with <code>ALLOW_PRIVATE_MCP=1</code>.
          </p>
        </div>
      </div>

      <ServerDetail
        server={selected}
        onClose={() => setSelectedId(null)}
        onRefresh={refresh}
        refreshing={refreshing === selected?.id}
        onToggle={(enabled) => {
          if (!selected) return
          void updateServer(selected.id, { enabled })
            .then(() => notify(enabled ? `${selected.name} exposed to the agent` : `${selected.name} hidden`))
            .catch((caught: unknown) => notify(caught instanceof Error ? caught.message : 'Update failed'))
        }}
        onDelete={() => {
          if (!selected) return
          const target = selected
          void removeServer(target.id)
            .then(() => {
              setSelectedId(null)
              notify(`${target.name} removed`)
            })
            .catch((caught: unknown) => notify(caught instanceof Error ? caught.message : 'Delete failed'))
        }}
        onCall={callTool}
        notify={notify}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add an MCP server"
        subtitle="HTTPS only. Streamable HTTP is preferred; SSE servers still work."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || !url.trim()} onClick={() => void create()}>
              {busy ? <Loader2 size={12} className="spin" /> : <Plug size={12} />}
              {busy ? 'Discovering…' : 'Add and discover'}
            </button>
          </>
        }
      >
        <Field label="Name" htmlFor="mcp-name">
          <input id="mcp-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Internal docs" maxLength={80} />
        </Field>
        <Field label="Endpoint" htmlFor="mcp-url" hint="e.g. https://mcp.example.com/mcp">
          <input id="mcp-url" className="input mono" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://mcp.example.com/mcp" />
        </Field>
        <Field label="Transport">
          <select className="input" value={transport} onChange={(event) => setTransport(event.target.value as McpTransport)}>
            <option value="streamable-http">streamable-http</option>
            <option value="sse">sse</option>
          </select>
        </Field>
        <Field label="Bearer token" hint="Optional. Encrypted before storage." htmlFor="mcp-auth">
          <input id="mcp-auth" className="input mono" type="password" value={auth} onChange={(event) => setAuth(event.target.value)} autoComplete="off" placeholder="optional" />
        </Field>
        {error ? <p className="field-error">{error}</p> : null}
        <p className="tiny faint">
          <ShieldCheck size={10} /> Adding a server runs a real <code>initialize</code> and{' '}
          <code>tools/list</code> handshake.
        </p>
      </Modal>
    </div>
  )
}

function StatusFor({ server, refreshing }: { server: McpServer; refreshing: boolean }) {
  if (refreshing) {
    return (
      <Chip tone="blue">
        <Loader2 size={10} className="spin" /> refreshing
      </Chip>
    )
  }
  if (server.status === 'connected') return <Chip tone="lime">connected</Chip>
  if (server.status === 'error') return <Chip tone="red">error</Chip>
  return <Chip tone="neutral">available</Chip>
}

function ServerDetail({
  server,
  onClose,
  onRefresh,
  refreshing,
  onToggle,
  onDelete,
  onCall,
  notify,
}: {
  server: McpServer | undefined
  onClose: () => void
  onRefresh: (server: McpServer) => Promise<void>
  refreshing: boolean
  onToggle: (enabled: boolean) => void
  onDelete: () => void
  onCall: (id: string, tool: string, args: Record<string, unknown>) => Promise<{ content: string }>
  notify: (message: string) => void
}) {
  const [toolName, setToolName] = useState('')
  const [args, setArgs] = useState<Record<string, string>>({})
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tool: McpTool | undefined = server?.tools.find((item) => item.name === toolName)
  const fields = tool ? toolFields(tool) : []

  const run = async () => {
    if (!server || !tool) return
    const { args: parsed, error: invalid } = coerceToolArgs(fields, args)
    if (invalid) {
      setError(invalid)
      return
    }
    setRunning(true)
    setError(null)
    setOutput(null)
    try {
      const result = await onCall(server.id, tool.name, parsed)
      setOutput(result.content || '(empty result)')
      notify(`${server.name}/${tool.name} returned`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tool call failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      open={Boolean(server)}
      onClose={() => {
        setToolName('')
        setArgs({})
        setOutput(null)
        setError(null)
        setConfirmDelete(false)
        onClose()
      }}
      title={server?.name ?? 'MCP server'}
      subtitle={server ? `${server.transport} · ${server.toolsCount} tools` : undefined}
      width={600}
      footer={
        server ? (
          <>
            {confirmDelete ? (
              <span className="confirm-inline">
                remove this server?
                <button type="button" className="danger-link" onClick={onDelete}>
                  remove
                </button>
                <button type="button" className="link-btn" onClick={() => setConfirmDelete(false)}>
                  cancel
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={12} /> Remove
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn" disabled={refreshing} onClick={() => server && void onRefresh(server)}>
              {refreshing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Refresh tools
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              <Check size={12} /> Done
            </button>
          </>
        ) : null
      }
    >
      {server ? (
        <>
          <div className="int-detail-status">
            <StatusFor server={server} refreshing={refreshing} />
            <span className="mono tiny faint">{server.url}</span>
          </div>
          {server.error ? (
            <div className="inline-warn">
              <CircleAlert size={12} /> {server.error}
            </div>
          ) : null}

          <Toggle
            checked={server.enabled}
            onChange={onToggle}
            label="Expose this server to the agent"
            hint="Disabled servers stay configured but drop out of the composer's tool picker."
          />

          <h4 className="modal-section-title">Discovered tools</h4>
          {server.tools.length ? (
            <>
              <Field label="Tool">
                <select
                  className="input mono"
                  value={toolName}
                  onChange={(event) => {
                    setToolName(event.target.value)
                    setArgs({})
                    setOutput(null)
                    setError(null)
                  }}
                >
                  <option value="">Choose a tool…</option>
                  {server.tools.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              {tool?.description ? <p className="tool-picker-desc">{tool.description}</p> : null}
              {fields.map((field) => (
                <Field key={field.name} label={`${field.name}${field.required ? ' *' : ''}`} hint={field.description}>
                  {field.kind === 'boolean' ? (
                    <select
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
                      className="input mono"
                      type={field.kind === 'number' ? 'number' : 'text'}
                      value={args[field.name] ?? ''}
                      onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                    />
                  )}
                </Field>
              ))}
              <button type="button" className="btn btn-primary" disabled={!tool || running} onClick={() => void run()}>
                {running ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Run tool
              </button>
              {error ? <p className="field-error">{error}</p> : null}
              {output ? (
                <div className="mcp-output">
                  <span className="mono tiny faint">result</span>
                  <pre>{output}</pre>
                </div>
              ) : null}
            </>
          ) : (
            <p className="tiny faint">
              No tools discovered yet. Refresh after checking the endpoint, or the server may require a
              token.
            </p>
          )}

          <div className="int-tools">
            <div><span>Transport</span><strong className="mono">{server.transport}</strong></div>
            <div><span>Auth</span><strong className="mono">{server.authSet ? 'encrypted token' : 'none'}</strong></div>
            <div><span>Tool namespace</span><strong className="mono">{server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_*</strong></div>
            <div><span>Agent</span><strong className="mono">{server.enabled ? 'allowed' : 'blocked'}</strong></div>
          </div>
        </>
      ) : null}
    </Modal>
  )
}
