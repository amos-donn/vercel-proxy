import { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Loader2,
  Lock,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Unplug,
} from 'lucide-react'
import { useStore } from '../store'
import type { Integration } from '../types'
import { Chip, Empty, Field, Modal, Segmented, Toggle } from '../components/ui'

const categories = ['All', 'Code', 'Planning', 'Messaging', 'Data', 'Docs', 'Browser', 'Custom']

export function IntegrationsPage() {
  const { integrations, patchIntegration, addIntegration, notify } = useStore()
  const [category, setCategory] = useState('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [transport, setTransport] = useState<'streamable-http' | 'sse' | 'stdio'>('streamable-http')

  const selected = integrations.find((item) => item.id === selectedId)
  const rows = category === 'All' ? integrations : integrations.filter((item) => item.category === category)

  const connect = (integration: Integration) => {
    setConnecting(integration.id)
    window.setTimeout(() => {
      patchIntegration(integration.id, {
        status: 'connected',
        agents: Math.max(1, integration.agents),
      })
      setConnecting(null)
      notify(`${integration.name} connected · tool list verified`)
    }, 1100)
  }

  const disconnect = (integration: Integration) => {
    patchIntegration(integration.id, { status: 'available', agents: 0 })
    setSelectedId(null)
    notify(`${integration.name} disconnected · its tools are unavailable`)
  }

  const createCustom = () => {
    if (!name.trim() || !url.trim()) return
    const id = `int_custom_${Math.random().toString(36).slice(2, 7)}`
    addIntegration({
      id,
      name: name.trim(),
      category: 'Custom',
      blurb: url.trim(),
      transport,
      status: 'connected',
      scopes: ['tools:read'],
      tools: 0,
      agents: 1,
    })
    setCustomOpen(false)
    setCategory('All')
    setName('')
    setUrl('')
    setSelectedId(id)
    notify('MCP server added · tool discovery queued')
  }

  return (
    <div className="page page-integrations">
      <header className="page-head">
        <div>
          <h1>Integrations</h1>
          <p>
            MCP servers expose tools, not credentials. The broker verifies the server, pins a tool
            namespace, and shows which agents can call it before anything is enabled.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCustomOpen(true)}>
          <Plus size={13} /> Add MCP server
        </button>
      </header>

      <div className="toolbar">
        <Segmented size="sm" value={category} onChange={setCategory} options={categories.map((item) => ({ value: item, label: item }))} />
        <span className="tiny faint">
          {integrations.filter((item) => item.status === 'connected').length} connected · {integrations.reduce((sum, item) => sum + item.tools, 0)} tools
        </span>
      </div>

      <div className="int-grid">
        {rows.map((integration) => (
          <button
            key={integration.id}
            type="button"
            className="int-card"
            onClick={() => setSelectedId(integration.id)}
          >
            <div className="int-card-head">
              <span className={`int-mark tone-${toneFor(integration)}`}>{integration.name.slice(0, 1)}</span>
              <div className="int-card-title">
                <strong>{integration.name}</strong>
                <span className="tiny faint">{integration.category} · {integration.transport}</span>
              </div>
              <StatusFor integration={integration} connecting={connecting === integration.id} />
            </div>
            <p>{integration.blurb}</p>
            <div className="int-card-foot">
              <span className="mono tiny">{integration.tools} tools</span>
              <span className="mono tiny">{integration.agents} agents</span>
              {integration.verified ? <span className="verified"><ShieldCheck size={11} /> verified</span> : null}
              <ArrowUpRight size={12} className="int-arrow" />
            </div>
          </button>
        ))}
        {!rows.length ? <Empty title="Nothing in this category">Add an MCP server to extend the toolset.</Empty> : null}
      </div>

      <div className="int-note">
        <Lock size={13} />
        <div>
          <strong>Tool permissions are separate from keys</strong>
          <p>
            Connecting a server does not grant an agent access. Each tool call is checked against the
            agent’s posture; write tools still stop at the approval gate.
          </p>
        </div>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? 'Integration'}
        subtitle={selected ? `${selected.category} · ${selected.transport} · ${selected.tools} tools` : undefined}
        width={560}
        footer={
          selected ? (
            <>
              {selected.status === 'connected' ? (
                <button type="button" className="btn btn-quiet" onClick={() => disconnect(selected)}>
                  <Unplug size={12} /> Disconnect
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={selected.status === 'connected' || connecting === selected.id}
                onClick={() => connect(selected)}
              >
                {connecting === selected.id ? <Loader2 size={12} className="spin" /> : <Plug size={12} />}
                {selected.status === 'needs_auth' ? 'Authorize' : selected.status === 'connected' ? 'Connected' : 'Connect'}
              </button>
            </>
          ) : null
        }
      >
        {selected ? (
          <>
            <div className="int-detail-status">
              <StatusFor integration={selected} connecting={connecting === selected.id} />
              {selected.verified ? <span className="verified"><ShieldCheck size={12} /> verified by the broker</span> : <span className="tiny faint">unverified server · namespace pinned on connect</span>}
            </div>
            <p className="int-detail-blurb">{selected.blurb}</p>

            <h4 className="modal-section-title">Scopes requested</h4>
            <div className="scope-list">
              {selected.scopes.map((scope) => (
                <span key={scope} className="scope-chip mono"><Check size={10} /> {scope}</span>
              ))}
            </div>

            <h4 className="modal-section-title">Expose to agents</h4>
            <Toggle
              checked={selected.agents > 0}
              onChange={(next) => patchIntegration(selected.id, { agents: next ? 1 : 0 })}
              label="Let agents call this server"
              hint="Per-agent tool policy still applies. Writes need approval."
            />

            <div className="int-tools">
              <div><span>Transport</span><strong className="mono">{selected.transport}</strong></div>
              <div><span>Tool namespace</span><strong className="mono">{selected.name.toLowerCase()}_*</strong></div>
              <div><span>Auth</span><strong className="mono">{selected.status === 'needs_auth' ? 'OAuth required' : 'vault secret'}</strong></div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Add an MCP server"
        subtitle="Streamable HTTP is preferred; stdio is bridged by the Worker runtime."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setCustomOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!name.trim() || !url.trim()} onClick={createCustom}>
              Add server
            </button>
          </>
        }
      >
        <Field label="Name" htmlFor="mcp-name">
          <input id="mcp-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Internal docs" />
        </Field>
        <Field label="Endpoint" htmlFor="mcp-url" hint="https:// or a local stdio command">
          <input id="mcp-url" className="input mono" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://mcp.example.com/mcp" />
        </Field>
        <Field label="Transport">
          <select className="input" value={transport} onChange={(event) => setTransport(event.target.value as typeof transport)}>
            <option value="streamable-http">streamable-http</option>
            <option value="sse">sse</option>
            <option value="stdio">stdio</option>
          </select>
        </Field>
      </Modal>
    </div>
  )
}

function StatusFor({ integration, connecting }: { integration: Integration; connecting: boolean }) {
  if (connecting) {
    return <Chip tone="blue"><Loader2 size={10} className="spin" /> connecting</Chip>
  }
  if (integration.status === 'connected') return <Chip tone="lime">connected</Chip>
  if (integration.status === 'needs_auth') return <Chip tone="amber">needs auth</Chip>
  if (integration.status === 'degraded') return <Chip tone="red">degraded</Chip>
  return <Chip tone="neutral">available</Chip>
}

function toneFor(integration: Integration) {
  if (integration.status === 'connected') return 'lime'
  if (integration.status === 'needs_auth' || integration.status === 'degraded') return 'amber'
  return 'blue'
}

export function integrationIcon(category: string) {
  return category === 'Browser' ? Terminal : category === 'Data' ? RefreshCw : Plug
}
