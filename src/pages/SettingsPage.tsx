import { useEffect, useState } from 'react'
import {
  ChevronRight,
  Cloud,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Terminal,
  UserRound,
  Zap,
} from 'lucide-react'
import { useStore } from '../store'
import type { ApprovalPosture, ModelOption, View } from '../types'
import { liveCatalogProviders, modelLabel, providerForModel } from '../data/providers'
import { api } from '../lib/api'
import { cn, money, tokens } from '../lib/format'
import { Chip, Field, Meter, Segmented, Toggle } from '../components/ui'

const defaultThresholds = { accept: 0.62, escalate: 0.55, risky: 0.5 }

const curatedModels = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 · Anthropic' },
  { id: 'claude-opus-5', label: 'Claude Opus 5 · Anthropic' },
  { id: 'gpt-5.2', label: 'GPT-5.2 · OpenAI' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini · OpenAI' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro · Google' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2 · OpenRouter' },
]

export function SettingsPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const {
    settings,
    providers,
    user,
    keys,
    usage,
    chats,
    files,
    saveState,
    patchSettings,
    setPosture,
    signOut,
    notify,
  } = useStore()
  const jevReady = providers.some((provider) => provider.id === 'typesafe' && provider.status === 'connected')
  const system2Ready = providers.some((provider) => provider.id !== 'typesafe' && provider.status === 'connected')
  const [health, setHealth] = useState<'idle' | 'checking' | 'ok' | 'down'>('idle')
  const [healthText, setHealthText] = useState('Not checked yet.')
  const catalogProviders = providers.filter(
    (provider) =>
      provider.status === 'connected' && liveCatalogProviders.some((id) => id === provider.id),
  )
  const catalogProviderIds = catalogProviders.map((provider) => provider.id)
  const catalogKey = catalogProviderIds.join(',')
  const [catalogs, setCatalogs] = useState<Record<string, ModelOption[]>>({})
  const [catalogErrors, setCatalogErrors] = useState<Record<string, string>>({})
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [modelQuery, setModelQuery] = useState('')

  const testRuntime = async () => {
    setHealth('checking')
    setHealthText('Requesting /api/health…')
    try {
      const body = await api.health()
      const ready = providers.filter((provider) => provider.status === 'connected').length
      setHealth(body.ok ? 'ok' : 'down')
      setHealthText(
        `Worker ok · Jev ${body.jev ? 'ready' : 'needs a key'} · System 2 ${
          body.system2 ? 'ready' : 'needs a key'
        } · ${ready}/${providers.length} providers · custody ${body.keyCustody}`,
      )
    } catch (error) {
      setHealth('down')
      setHealthText(error instanceof Error ? error.message : 'Health check failed')
    }
  }

  const loadCatalogs = async () => {
    if (!catalogProviderIds.length) {
      setCatalogs({})
      setCatalogErrors({})
      setCatalogState('idle')
      return
    }
    setCatalogState('loading')
    setCatalogErrors({})
    const entries = await Promise.all(
      catalogProviderIds.map(async (id) => {
        try {
          const body = await api.models(id)
          return { id, models: body.models, error: '' }
        } catch (error) {
          return {
            id,
            models: [] as ModelOption[],
            error: error instanceof Error ? error.message : `Could not load the ${id} catalog.`,
          }
        }
      }),
    )
    const nextCatalogs: Record<string, ModelOption[]> = {}
    const nextErrors: Record<string, string> = {}
    for (const entry of entries) {
      nextCatalogs[entry.id] = entry.models
      if (entry.error) nextErrors[entry.id] = entry.error
    }
    setCatalogs(nextCatalogs)
    setCatalogErrors(nextErrors)
    setCatalogState(entries.every((entry) => entry.error) ? 'error' : 'ready')
  }

  useEffect(() => {
    void loadCatalogs()
  }, [catalogKey])

  const query = modelQuery.trim().toLowerCase()
  const catalogCount = Object.values(catalogs).reduce((total, models) => total + models.length, 0)
  const loadedCount = (id: string) => catalogs[id]?.length ?? 0
  const catalogErrorList = Object.entries(catalogErrors).map(
    ([id, message]) => `${providers.find((provider) => provider.id === id)?.name ?? id}: ${message}`,
  )
  const catalogNames = catalogProviderIds
    .filter((id) => catalogs[id]?.length)
    .map(
      (id) =>
        `${providers.find((provider) => provider.id === id)?.name ?? id} ${catalogs[id].length}`,
    )
  const curatedIds = new Set(curatedModels.map((model) => model.id))
  const selectedEntry = catalogProviderIds
    .flatMap((provider) => (catalogs[provider] ?? []).map((model) => ({ provider, model })))
    .find((entry) => entry.model.id === settings.s2Model)
  const selectedCatalogModel = selectedEntry?.model
  const visibleGroups = catalogProviderIds
    .map((provider) => {
      const all = catalogs[provider] ?? []
      const models = all.filter((model) => {
        const raw = modelLabel(model.id)
        if (curatedIds.has(model.id) || curatedIds.has(raw)) return false
        if (!query) return true
        return (
          model.id.toLowerCase().includes(query) ||
          model.name.toLowerCase().includes(query) ||
          raw.toLowerCase().includes(query)
        )
      })
      if (
        selectedEntry &&
        selectedEntry.provider === provider &&
        !models.some((model) => model.id === selectedEntry.model.id)
      ) {
        models.unshift(selectedEntry.model)
      }
      return {
        provider,
        name: providers.find((item) => item.id === provider)?.name ?? provider,
        total: all.length,
        models,
      }
    })
    .filter((group) => group.models.length > 0)
  const selectedProvider = providerForModel(settings.s2Model)
  const selectedProviderName =
    providers.find((provider) => provider.id === selectedProvider)?.name ?? selectedProvider
  const selectedProviderReady = providers.some(
    (provider) => provider.id === selectedProvider && provider.status === 'connected',
  )

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(`${label} copied`)
    } catch {
      notify('Clipboard blocked')
    }
  }

  return (
    <div className="page page-settings">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>
            Harness defaults: how cheap the fast path must be, when the heavy model wakes, and where a
            human is required. Everything here saves to your workspace.
          </p>
        </div>
        <Chip tone="neutral">{saveState === 'saved' ? 'saved to D1' : saveState === 'saving' ? 'saving…' : 'live'}</Chip>
      </header>

      <div className="settings-grid">
        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Runtime</h2><span className="tiny faint">where decisions are made</span></div>
            <Cloud size={15} />
          </header>
          <Segmented
            value={settings.runtime}
            onChange={(runtime) => patchSettings({ runtime, runtimeChosen: true })}
            options={[
              { value: 'simulated', label: 'Simulated' },
              { value: 'live', label: 'Live Worker' },
            ]}
          />
          <div className="runtime-lanes">
            <div><span>System 1 · Jev</span><b>{jevReady ? 'ready' : 'not configured'}</b></div>
            <div><span>System 2 · model</span><b>{system2Ready ? 'ready' : 'no key'}</b></div>
            <div><span>Architecture</span><b>{jevReady ? 'dual process' : 'direct single model'}</b></div>
          </div>
          <p className="setting-copy">
            Simulated is deterministic and needs no keys: it exercises routing, tools, gates and costs.
            Live uses <code>/api/jev</code> when System 1 is configured. Without a Jev key it skips typed
            routing and calls <code>/api/system2</code> as a normal single-model agent.
          </p>
          <div className="health-row">
            <button type="button" className="btn btn-sm" onClick={() => void testRuntime()} disabled={health === 'checking'}>
              {health === 'checking' ? <Loader2 size={12} className="spin" /> : <Zap size={12} />} Test runtime
            </button>
            <span className={cn('health-text', health === 'ok' && 'ok', health === 'down' && 'bad')}>{healthText}</span>
          </div>
          {settings.runtime === 'live' ? (
            <div className="inline-warn">
              <ShieldAlert size={12} />
              {jevReady
                ? 'System 1 routes every turn; System 2 writes when the decision warrants it.'
                : 'No System 1 key: every live turn goes straight to the selected System 2 model.'}{' '}
              Provider errors surface on the turn — live never silently falls back to simulation.
            </div>
          ) : null}
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>System 1 · Jev</h2><span className="tiny faint">typed decisions only</span></div>
            <Zap size={15} />
          </header>
          <Field label="Model">
            <select className="input mono" value={settings.jevModel} onChange={(event) => patchSettings({ jevModel: event.target.value })}>
              <option value="jev-1.14.0">jev-1.14.0</option>
              <option value="jev-1.13.2">jev-1.13.2</option>
            </select>
          </Field>
          <Field label={`Accept confidence · ${settings.thresholds.accept.toFixed(2)}`} hint="Below this, the turn escalates before any tool runs.">
            <input
              className="range"
              type="range"
              min={0.3}
              max={0.95}
              step={0.01}
              value={settings.thresholds.accept}
              onChange={(event) => patchSettings({ thresholds: { ...settings.thresholds, accept: Number(event.target.value) } })}
            />
          </Field>
          <Field label={`Escalate at needs_system_2 · ${settings.thresholds.escalate.toFixed(2)}`} hint="A typed probability, not a vibe. Lower means more System 2.">
            <input
              className="range"
              type="range"
              min={0.2}
              max={0.9}
              step={0.01}
              value={settings.thresholds.escalate}
              onChange={(event) => patchSettings({ thresholds: { ...settings.thresholds, escalate: Number(event.target.value) } })}
            />
          </Field>
          <Field label={`Risk gate · ${settings.thresholds.risky.toFixed(2)}`} hint="A write above this risk always stops for approval.">
            <input
              className="range"
              type="range"
              min={0.2}
              max={0.95}
              step={0.01}
              value={settings.thresholds.risky}
              onChange={(event) => patchSettings({ thresholds: { ...settings.thresholds, risky: Number(event.target.value) } })}
            />
          </Field>
          <button type="button" className="link-btn" onClick={() => patchSettings({ thresholds: defaultThresholds })}>
            Reset to defaults
          </button>
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>System 2</h2><span className="tiny faint">plans, judgement, prose</span></div>
            <Sparkles size={15} />
          </header>
          <Field label="Default lane" hint="The key for this model's provider must be in the Vault.">
            <div className="model-picker">
              <select className="input mono" value={settings.s2Model} onChange={(event) => patchSettings({ s2Model: event.target.value })}>
                <optgroup label="Direct lanes">
                  {curatedModels.map((model) => (
                    <option key={model.id} value={model.id}>{model.label}</option>
                  ))}
                </optgroup>
                {!curatedModels.some((model) => model.id === settings.s2Model) && !selectedCatalogModel ? (
                  <option value={settings.s2Model}>{modelLabel(settings.s2Model)} — saved</option>
                ) : null}
                {visibleGroups.map((group) => (
                  <optgroup key={group.provider} label={`${group.name} · ${group.total} models`}>
                    {group.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name === modelLabel(model.id)
                          ? model.name
                          : `${model.name} — ${modelLabel(model.id)}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {catalogProviderIds.length ? (
                <div className="model-catalog">
                  <input
                    className="input"
                    placeholder={catalogCount ? `Filter ${catalogCount} models…` : 'Filter live model catalogs…'}
                    value={modelQuery}
                    onChange={(event) => setModelQuery(event.target.value)}
                    aria-label="Filter live model catalogs"
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void loadCatalogs()}
                    disabled={catalogState === 'loading'}
                  >
                    {catalogState === 'loading' ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                    {catalogState === 'loading' ? 'Loading' : 'Refresh'}
                  </button>
                </div>
              ) : null}
              {catalogErrorList.map((message) => (
                <div className="inline-warn" key={message}>
                  <ShieldAlert size={12} /> {message}
                </div>
              ))}
              {catalogState === 'ready' && catalogCount ? (
                <p className="tiny faint">
                  {catalogCount} models loaded · {catalogNames.join(' · ')}. Search by name or id.
                </p>
              ) : null}
              {selectedCatalogModel ? (
                <p className="tiny faint model-meta">
                  {selectedCatalogModel.context
                    ? `${Math.round(selectedCatalogModel.context / 1000)}k context`
                    : 'context not listed'}
                  {selectedCatalogModel.promptPerMillion !== undefined
                    ? ` · $${selectedCatalogModel.promptPerMillion.toFixed(2)}/M in · $${(
                        selectedCatalogModel.completionPerMillion ?? 0
                      ).toFixed(2)}/M out`
                    : ''}
                </p>
              ) : null}
              {!selectedProviderReady ? (
                <div className="inline-warn">
                  <ShieldAlert size={12} /> This lane needs a {selectedProviderName} key. Pick a model
                  from a connected provider.
                </div>
              ) : null}
            </div>
          </Field>
          <Field label="Effort">
            <Segmented
              size="sm"
              value={settings.effort}
              onChange={(effort) => patchSettings({ effort })}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Field>
          <div className="stat-rows">
            <div><span>Spend in this workspace</span><span className="mono">{money(usage.spend)}</span></div>
            <div><span>Saved vs. always-System 2</span><span className="mono">{money(Math.max(0, usage.saved))}</span></div>
            <div><span>Typed decisions</span><span className="mono">{usage.decisions}</span></div>
            <div><span>Prompt tokens</span><span className="mono">{tokens(usage.promptTokens)}</span></div>
          </div>
          <Meter value={usage.fastPath} tone="lime" label="Fast-path share" />
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Approval posture</h2><span className="tiny faint">irreversible actions</span></div>
            <ShieldAlert size={15} />
          </header>
          <div className="posture-column">
            {(
              [
                ['auto', 'Auto', 'Reads and drafts proceed. Writes, deletes and publishes still gate.'],
                ['risky', 'Gate risky', 'Any write, delete, publish or spend stops for one approval.'],
                ['ask', 'Ask first', 'Every tool call waits. Slowest, safest.'],
              ] as Array<[ApprovalPosture, string, string]>
            ).map(([value, label, copyText]) => (
              <button
                key={value}
                type="button"
                className={cn('posture-card', settings.posture === value && 'is-on')}
                onClick={() => setPosture(value)}
              >
                <span className="posture-radio">{settings.posture === value ? '✓' : null}</span>
                <span>
                  <strong>{label}</strong>
                  <span>{copyText}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="setting-note">The typed risk answer can add a gate, never remove one.</p>
        </section>

        <section className="panel setting-section span-2">
          <header className="panel-head">
            <div><h2>Providers</h2><span className="tiny faint">BYOK · encrypted in D1</span></div>
            <KeyRound size={15} />
          </header>
          <div className="provider-list">
            {providers.map((provider) => (
              <div key={provider.id} className={cn('provider-row', provider.status === 'missing' && 'is-missing')}>
                <span className={cn('provider-mark', `tone-${provider.tone}`)}>{provider.mark}</span>
                <div className="provider-copy">
                  <strong>{provider.name}</strong>
                  <span className="tiny faint">{provider.note}</span>
                </div>
                <span className="provider-models mono tiny">
                  {loadedCount(provider.id)
                    ? `${loadedCount(provider.id)} loaded`
                    : liveCatalogProviders.some((id) => id === provider.id)
                      ? 'live catalog'
                      : `${provider.models} models`}
                </span>
                <span className="provider-key mono tiny">{provider.keyMask ?? 'no key'}</span>
                {provider.status === 'connected' ? (
                  <Chip tone="lime">{provider.source === 'worker' ? 'worker secret' : 'connected'}</Chip>
                ) : (
                  <Chip tone="amber">missing</Chip>
                )}
              </div>
            ))}
          </div>
          <div className="setting-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onNavigate({ name: 'vault' })}>
              Manage keys <ChevronRight size={12} />
            </button>
            <span className="tiny faint">
              {keys.filter((key) => key.source === 'user').length} stored by you ·{' '}
              {keys.filter((key) => key.source === 'worker').length} from Worker secrets
            </span>
          </div>
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Account</h2><span className="tiny faint">this session</span></div>
            <UserRound size={15} />
          </header>
          <div className="stat-rows">
            <div><span>Name</span><span className="mono">{user?.name ?? '—'}</span></div>
            <div><span>Email</span><span className="mono">{user?.email ?? '—'}</span></div>
            <div>
              <span>Member since</span>
              <span className="mono">
                {user ? new Date(user.createdAt).toLocaleDateString() : '—'}
              </span>
            </div>
            <div><span>Session</span><span className="mono">HttpOnly cookie · 30 days</span></div>
          </div>
          <div className="setting-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void signOut()}
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Workspace</h2><span className="tiny faint">saved per account</span></div>
            <Database size={15} />
          </header>
          <div className="stat-rows">
            <div><span>Persistence</span><span className="mono">D1 · snapshot</span></div>
            <div><span>Last save</span><span className="mono">{saveState}</span></div>
            <div><span>Chats</span><span className="mono">{chats.length}</span></div>
            <div><span>Files</span><span className="mono">{files.length}</span></div>
          </div>
          <p className="setting-copy">
            The workspace is a JSON snapshot written on a short debounce and again when the tab closes.
            Provider keys and MCP tokens live in their own encrypted columns, not in the snapshot.
          </p>
        </section>

        <section className="panel setting-section">
          <header className="panel-head">
            <div><h2>Interface</h2><span className="tiny faint">this browser</span></div>
          </header>
          <Toggle checked={settings.compact} onChange={(compact) => patchSettings({ compact })} label="Compact density" hint="Tighter rows in chats and tables." />
          <Toggle
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => {
              patchSettings({ reducedMotion })
              document.documentElement.classList.toggle('reduce-motion', reducedMotion)
            }}
            label="Reduce motion"
            hint="Stops streaming cadence and animated dots."
          />
        </section>

        <section className="panel setting-section span-2">
          <header className="panel-head">
            <div><h2>Deploy</h2><span className="tiny faint">Cloudflare Workers</span></div>
            <Terminal size={15} />
          </header>
          <div className="deploy-grid">
            <div className="deploy-card">
              <span className="deploy-label">Worker</span>
              <code>sosystem.amos-donn.workers.dev</code>
              <button type="button" className="link-btn" onClick={() => copy('https://sosystem.amos-donn.workers.dev', 'Worker URL')}>
                <Copy size={10} /> copy
              </button>
            </div>
            <div className="deploy-card">
              <span className="deploy-label">Database</span>
              <code>D1 · sosystem · binding DB</code>
              <span className="tiny faint">Tables are created on the first API request.</span>
            </div>
          </div>
          <div className="command-row">
            <Terminal size={12} />
            <code>git push origin master</code>
            <button type="button" className="link-btn" onClick={() => copy('git push origin master', 'Push command')}>
              <Copy size={10} /> copy
            </button>
          </div>
          <p className="setting-note">
            <Cloud size={11} /> Workers Builds runs <code>npm run build</code> and{' '}
            <code>npx wrangler deploy</code> on every push to <code>master</code>. Add an optional{' '}
            <code>SOSYSTEM_SECRET</code> to seal keys with your own secret instead of the generated
            deployment key.
          </p>
        </section>
      </div>

      <footer className="settings-foot">
        <span className="mono">Mezze v0.4.5</span>
        <span>Built for Cloudflare Workers · React 19 · Jev {settings.jevModel}</span>
        <span className="grow" />
        <span>D1 workspace · encrypted BYOK · MCP</span>
      </footer>
    </div>
  )
}
