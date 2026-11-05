import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Download,
  ExternalLink,
  FileText,
  Frame,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  Pin,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useStore } from '../store'
import { modelLabel } from '../data/providers'
import type { ActionStep, Chat, ChatMessage, FileDiff, McpToolCall, PlanStep, Skill, View, WorkspaceFile } from '../types'
import { cn, money, sleep, splitWords, uid } from '../lib/format'
import { Markdown } from '../lib/markdown'
import { executeTurn, type TurnEvidence, type TurnHistoryMessage, type TurnWorkspace } from '../engine/runtime'
import type { AgentContext, AgentToolTrace } from '../engine/agent'
import { canvasFiles } from '../engine/canvasDoc'
import { TraceCard } from '../components/TraceCard'
import { Composer, type ComposerMode } from '../components/Composer'
import { Chip, Segmented, StatusPill, Tabs } from '../components/ui'

/** Pull the readable part of a half-written JSON envelope for the live bubble. */
function partialThought(raw: string): string {
  const match = raw.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)/)
  if (!match) return ''
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }
}

export function ChatView({ id, onNavigate }: { id: string; onNavigate: (view: View) => void }) {
  const store = useStore()
  const chat = store.chats.find((item) => item.id === id)
  const [mode, setMode] = useState<ComposerMode>('auto')
  const [think, setThink] = useState(false)
  const [sideTab, setSideTab] = useState<'overview' | 'plan' | 'artifacts'>('overview')
  const [busy, setBusy] = useState(false)
  const [activeStep, setActiveStep] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const alive = useRef(true)
  // The model streams tokens before it names a tool. Patching one bubble is
  // cheaper than appending a message per token.
  const liveThoughtId = useRef<string | null>(null)
  const liveThoughtAt = useRef(0)

  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const startedAt = Date.now()
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  const agent = store.agents.find((item) => item.id === chat?.agentId)
  const system1Ready = store.providers.some(
    (provider) => provider.id === 'typesafe' && provider.status === 'connected',
  )
  const pendingApproval = chat?.messages.find(
    (message): message is Extract<ChatMessage, { kind: 'approval' }> =>
      message.kind === 'approval' && message.status === 'pending',
  )

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const tags = chat?.tags ?? []
    setMode(tags.includes('canvas') ? 'canvas' : tags.includes('write') ? 'write' : tags.includes('research') ? 'research' : 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id])

  const scheduledHere = chat ? store.scheduled.filter((item) => item.chatId === chat.id) : []
  const queued = chat ? store.queuePrompt[chat.id] : undefined

  useEffect(() => {
    if (!chat || !queued || busy) return
    const item = store.takeQueuedPrompt(chat.id)
    if (!item) return
    const force = Boolean(chat.tags?.includes('force-s2') || chat.tags?.includes('think'))
    const picked = item.skillIds
      .map((id) => store.skills.find((skill) => skill.id === id))
      .filter((skill): skill is Skill => Boolean(skill))
    void run(item.text, force, picked, item.toolCalls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id, queued, busy])

  const stats = useMemo(() => {
    const all = chat?.messages.filter(
      (message): message is Extract<ChatMessage, { kind: 'trace' }> => message.kind === 'trace',
    ) ?? []
    const direct = all.filter((message) => message.trace.direct).length
    const traces = all.filter((message) => !message.trace.direct)
    const escalations = traces.filter((message) => message.trace.route === 's2').length
    const saved = all.reduce((sum, message) => sum + message.trace.savedUsd, 0)
    const tools = chat?.messages.filter((message) => message.kind === 'tool').length ?? 0
    const artifacts = chat?.messages.filter((message) => message.kind === 'artifact') ?? []
    return {
      traces: traces.length,
      direct,
      escalations,
      saved,
      tools,
      fastPath: traces.length ? Math.round(((traces.length - escalations) / traces.length) * 100) : 0,
      artifacts,
    }
  }, [chat])

  const plan = useMemo<PlanStep[]>(() => {
    const latest = [...(chat?.messages ?? [])].reverse().find((message) => message.kind === 'plan')
    if (latest && latest.kind === 'plan') return latest.steps
    return chat?.plan ?? []
  }, [chat])

  if (!chat) {
    return (
      <div className="empty">
        <h3>That chat is gone.</h3>
        <button type="button" className="btn" onClick={() => onNavigate({ name: 'chats' })}>
          Back to chats
        </button>
      </div>
    )
  }

  const append = (message: ChatMessage) => store.appendMessage(chat.id, message)

  const stream = async (text: string, system: 's1' | 's2') => {
    const messageId = uid('m')
    append({ id: messageId, kind: 'assistant', text: '', at: stamp(), system, streaming: true })
    let acc = ''
    for (const word of splitWords(text)) {
      if (!alive.current) break
      acc += word
      store.patchMessage(chat.id, messageId, { text: acc })
      await sleep(12)
    }
    store.patchMessage(chat.id, messageId, { streaming: false })
  }

  const run = async (
    text: string,
    force: boolean,
    skills: Skill[] = [],
    toolCalls: McpToolCall[] = [],
  ) => {
    setBusy(true)
    store.patchChat(chat.id, { status: 'running', updated: 'just now', preview: text.slice(0, 120) })
    append({
      id: uid('m'),
      kind: 'user',
      text,
      at: stamp(),
      ...(skills.length
        ? { skills: skills.map((skill) => ({ id: skill.id, slug: skill.slug, name: skill.name })) }
        : {}),
    })

    // Continuity: the model sees the earlier turns of this chat, not just the
    // newest message, so follow-ups keep names, decisions and paths.
    const history = chat.messages
      .flatMap<TurnHistoryMessage>((message) => {
        if (message.kind === 'user') return [{ role: 'user' as const, content: message.text.slice(0, 4000) }]
        if (message.kind === 'assistant' && message.text.trim()) {
          return [{ role: 'assistant' as const, content: message.text.slice(0, 4000) }]
        }
        return []
      })
      .slice(-12)

    // One action log per turn. Every atomic step arrives as a verb-driven
    // label while it runs, with its details behind a dropdown.
    const stepsId = uid('m')
    append({ id: stepsId, kind: 'steps', steps: [] })
    let stepItems: ActionStep[] = []
    const onStep = (step: ActionStep) => {
      const known = stepItems.some((item) => item.id === step.id)
      stepItems = known
        ? stepItems.map((item) => (item.id === step.id ? { ...item, ...step } : item))
        : [...stepItems, step]
      store.patchMessage(chat.id, stepsId, { steps: stepItems })
      setActiveStep([...stepItems].reverse().find((item) => item.status === 'running')?.label ?? null)
    }

    // The agent loop's own surfaces: one tool card per action, a living focus
    // checklist, and a thought stream between actions.
    const workspace = buildWorkspaceContext(store.files)
    const fileIndex = new Map(store.files.map((file) => [file.path, file]))
    const canvasIndex = new Map(store.canvases.map((canvas) => [canvas.id, canvas]))
    const planId = uid('m')
    let planReady = false

    const onTool = (tool: AgentToolTrace) => {
      if (tool.status === 'running') {
        append({ id: tool.id, kind: 'tool', name: tool.name, title: tool.title, input: tool.input, status: 'running' })
        return
      }
      store.patchMessage(chat.id, tool.id, {
        status: tool.status,
        title: tool.title,
        output: tool.output,
        ms: tool.ms,
        ...(tool.diff ? { diff: tool.diff } : {}),
      })
    }

    const onPlan = (steps: PlanStep[]) => {
      if (!steps.length) return
      if (planReady) store.patchMessage(chat.id, planId, { steps })
      else {
        planReady = true
        append({ id: planId, kind: 'plan', steps })
      }
      store.patchChat(chat.id, { plan: steps })
    }

    // Live tokens: show the model's own reasoning while it is still writing,
    // so the turn reads as "thinking" instead of a frozen spinner.
    const onDelta = (raw: string) => {
      const thought = partialThought(raw)
      if (!thought) return
      if (!liveThoughtId.current) {
        const id = uid('m')
        liveThoughtId.current = id
        liveThoughtAt.current = performance.now()
        append({ id, kind: 'assistant', at: stamp(), system: 's2', text: thought, thinking: true, streaming: true })
        return
      }
      const now = performance.now()
      if (now - liveThoughtAt.current < 100) return
      liveThoughtAt.current = now
      store.patchMessage(chat.id, liveThoughtId.current, { text: thought })
    }

    const onThought = (text: string) => {
      if (liveThoughtId.current) {
        store.patchMessage(chat.id, liveThoughtId.current, { text, thinking: true, streaming: false })
        liveThoughtId.current = null
        return
      }
      append({ id: uid('m'), kind: 'assistant', at: stamp(), system: 's2', text, thinking: true })
    }

    const agentContext: AgentContext = {
      readFile: (path) =>
        fileIndex.get(path) ?? store.files.find((file) => file.path.toLowerCase() === path.toLowerCase()),
      writeFile: (path, text) => {
        store.writeFile(path, text, 'agent')
        append({
          id: uid('m'),
          kind: 'artifact',
          name: path.split('/').pop() ?? path,
          type: 'File',
          meta: 'written by the agent · open in Files',
          target: 'files',
        })
      },
      canvases: store.canvases.map((canvas) => ({
        id: canvas.id,
        name: canvas.name,
        files: canvasFiles(canvas),
      })),
      createCanvas: (draft) => {
        const canvas = store.addCanvas({ ...draft, origin: 'agent', chatId: chat.id })
        canvasIndex.set(canvas.id, canvas)
        agentContext.canvases.push({ id: canvas.id, name: canvas.name, files: canvasFiles(canvas) })
        append({
          id: uid('m'),
          kind: 'artifact',
          name: canvas.name,
          type: 'Canvas',
          meta: 'agent-built · open, edit and run',
          target: 'canvas',
          canvasId: canvas.id,
        })
        return { id: canvas.id, name: canvas.name }
      },
      updateCanvas: (id, patch) => {
        const before = canvasIndex.get(id)
        store.patchCanvas(id, patch)
        const name = patch.name ?? before?.name ?? 'Canvas'
        append({
          id: uid('m'),
          kind: 'artifact',
          name,
          type: 'Canvas',
          meta: 'updated by the agent · preview reloads',
          target: 'canvas',
          canvasId: id,
        })
        return { id, name }
      },
    }

    const agentHooks = { onStep, onTool, onThought, onDelta, onPlan, context: agentContext }

    const evidence: TurnEvidence[] = []
    for (const call of toolCalls) {
      const toolId = uid('m')
      append({
        id: toolId,
        kind: 'tool',
        name: `mcp.${call.tool}`,
        title: `${call.serverName} · ${call.tool}`,
        input: JSON.stringify(call.args, null, 2),
        status: 'running',
      })
      const startedAt = performance.now()
      try {
        const result = await store.callTool(call.serverId, call.tool, call.args)
        const output = result.content || '(empty result)'
        store.patchMessage(chat.id, toolId, {
          status: 'ok',
          output: output.slice(0, 6000),
          ms: Math.round(performance.now() - startedAt),
        })
        evidence.push({ title: `${call.serverName} · ${call.tool}`, output: output.slice(0, 6000) })
      } catch (error) {
        store.patchMessage(chat.id, toolId, {
          status: 'error',
          output: error instanceof Error ? error.message : 'MCP call failed',
          ms: Math.round(performance.now() - startedAt),
        })
        append({
          id: uid('m'),
          kind: 'notice',
          text: `MCP call failed · ${error instanceof Error ? error.message : 'unknown error'}`,
        })
      }
    }
    if (!alive.current) return

    try {
      const result = await executeTurn({
        goal: text,
        files: store.files.map((file) => file.path),
        fileCount: store.files.length,
        runningJobs: store.jobs.filter((job) => job.state !== 'succeeded').length,
        forceSystem2: force || mode !== 'auto' || evidence.length > 0,
        canvasRequested: mode === 'canvas' || Boolean(chat.tags?.includes('canvas')),
        thresholds: store.settings.thresholds,
        s2Model: store.settings.s2Model,
        runtime: store.settings.runtime,
        system1Configured: system1Ready,
        skills: skills.map((skill) => ({ name: skill.name, prompt: skill.prompt })),
        evidence,
        history,
        workspace,
        onStep,
        agent: { hooks: agentHooks },
      })
      if (!alive.current) return

      append({ id: uid('m'), kind: 'trace', trace: result.trace })
      if (result.notice) append({ id: uid('m'), kind: 'notice', text: result.notice })

      for (const tool of result.tools) {
        const toolId = uid('m')
        append({ id: toolId, kind: 'tool', name: tool.name, title: tool.title, input: tool.input, status: 'running' })
        await sleep(650)
        if (!alive.current) return
        store.patchMessage(chat.id, toolId, { status: 'ok', output: tool.output, ms: tool.ms ?? 620 })
      }

      if (result.plan?.length && !planReady) {
        append({ id: uid('m'), kind: 'plan', steps: result.plan })
        store.patchChat(chat.id, { plan: result.plan })
      }

      if (result.job) {
        store.addJob({
          id: `job_${Math.floor(Math.random() * 900 + 100)}`,
          title: result.job.title,
          provider: result.job.provider,
          kind: result.job.kind,
          state: 'paused_rate',
          attempt: 2,
          maxAttempts: 5,
          resumeAt: Date.now() + 22_000,
          reason: 'Gemini: 12 of 15 requests/min used. Retry-After honoured.',
          costUsd: 0.004,
          createdAt: 'just now',
          detail: result.job.detail,
          attempts: [
            { n: 1, at: 'just now', status: 'rate_limited', code: 'RESOURCE_EXHAUSTED', retryAfterMs: 2100, backoffMs: 2000, jitterMs: 640 },
            { n: 2, at: 'just now', status: 'rate_limited', code: 'RESOURCE_EXHAUSTED', retryAfterMs: 5400, backoffMs: 4000, jitterMs: -820 },
          ],
          mediaId: result.job.mediaId,
          chatId: chat.id,
        })
        if (result.media) {
          store.patchMedia(result.job.mediaId ?? '', { status: 'transcribing' })
        }
      }

      if (result.approval) {
        append({
          id: uid('m'),
          kind: 'approval',
          title: result.approval.title,
          detail: result.approval.detail,
          scope: result.approval.scope,
          risk: result.approval.risk,
          status: 'pending',
          action: result.approval.action,
          fileName: result.approval.fileName,
        })
        store.patchChat(chat.id, { status: 'waiting' })
        return
      }

      if (result.canvas) {
        const canvas = store.addCanvas({ ...result.canvas, origin: 'agent', chatId: chat.id })
        append({
          id: uid('m'),
          kind: 'artifact',
          name: canvas.name,
          type: 'Canvas',
          meta: 'sandboxed preview · open, edit and run',
          target: 'canvas',
          canvasId: canvas.id,
        })
      }

      if (result.artifact) {
        append({
          id: uid('m'),
          kind: 'artifact',
          name: result.artifact.name,
          type: result.artifact.type,
          meta: result.artifact.meta,
          target: result.artifact.target ?? 'files',
          content: result.artifact.content,
        })
      }

      await stream(result.assistant.text, result.assistant.system)
      store.patchChat(chat.id, { status: 'idle', updated: 'just now' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Turn failed'
      if (stepItems.some((step) => step.status === 'running')) {
        stepItems = stepItems.map((step) =>
          step.status === 'running' ? { ...step, status: 'error' as const, output: step.output ?? message } : step,
        )
        store.patchMessage(chat.id, stepsId, { steps: stepItems })
      }
      append({ id: uid('m'), kind: 'notice', text: message })
      store.patchChat(chat.id, { status: 'idle' })
    } finally {
      liveThoughtId.current = null
      if (alive.current) setActiveStep(null)
      if (alive.current) setBusy(false)
    }
  }

  const approve = (message: Extract<ChatMessage, { kind: 'approval' }>) => {
    store.patchMessage(chat.id, message.id, { status: 'approved', decision: 'Approved once' })
    const fileName = message.fileName ?? 'drafts/note.md'
    const prose = lastProse(chat)
    store.writeFile(
      fileName,
      `# ${chat.title}\n\nGenerated by System 2 · ${new Date().toLocaleDateString()}.\n\n${prose}\n`,
    )
    append({
      id: uid('m'),
      kind: 'tool',
      name: 'files.write',
      title: `Wrote ${fileName}`,
      input: `${fileName} · ${new TextEncoder().encode(prose).length} bytes`,
      status: 'ok',
      ms: 120,
    })
    append({
      id: uid('m'),
      kind: 'artifact',
      name: fileName.split('/').pop() ?? fileName,
      type: 'Markdown',
      meta: 'written · review before publishing',
      target: 'files',
    })
    append({
      id: uid('m'),
      kind: 'assistant',
      at: stamp(),
      system: 's2',
      text: `Wrote \`${fileName}\`. Nothing was published or pushed. The draft is in Files if you want to edit it directly.`,
    })
    store.patchChat(chat.id, { status: 'idle', updated: 'just now' })
    store.notify('Approved · 1 file written')
  }

  const deny = (message: Extract<ChatMessage, { kind: 'approval' }>) => {
    store.patchMessage(chat.id, message.id, { status: 'denied', decision: 'Denied by you' })
    append({
      id: uid('m'),
      kind: 'assistant',
      at: stamp(),
      system: 's2',
      text: 'Stopped. Nothing was written, sent or queued. The plan is still here if you want to change the scope.',
    })
    store.patchChat(chat.id, { status: 'idle', updated: 'just now' })
    store.notify('Denied · nothing changed')
  }

  const exportChat = () => {
    const lines = chat.messages.map((message) => {
      switch (message.kind) {
        case 'user':
          return `## You\n\n${message.text}`
        case 'assistant':
          return `## ${message.system === 's2' ? 'System 2' : 'System 1'}\n\n${message.text}`
        case 'trace':
          return `> System 1: ${message.trace.s1.decision} (${message.trace.s1.confidence.toFixed(2)})${
            message.trace.escalation ? ` → System 2: ${message.trace.escalation.reason}` : ''
          }`
        case 'tool':
          return `- \`${message.name}\` ${message.title}`
        case 'approval':
          return `- Approval: ${message.title} — ${message.status}`
        case 'artifact':
          return `- Artifact: ${message.name} (${message.type})`
        case 'plan':
          return `- Plan: ${message.steps.map((step) => step.label).join('; ')}`
        default:
          return ''
      }
    })
    const blob = new Blob([`# ${chat.title}\n\n${lines.join('\n\n')}\n`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${chat.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`
    link.click()
    URL.revokeObjectURL(url)
    store.notify('Chat exported as Markdown')
  }

  const disabled = busy || Boolean(pendingApproval) || chat.status === 'running'

  return (
    <div className="chat">
      <header className="chat-head">
        <button type="button" className="icon-btn" onClick={() => onNavigate({ name: 'chats' })} aria-label="Back to chats">
          <ArrowLeft size={16} />
        </button>
        <div className="chat-title-wrap">
          <div className="chat-title-line">
            <h1>{chat.title}</h1>
            {chat.status === 'waiting' ? (
              <StatusPill label="needs you" tone="amber" />
            ) : chat.status === 'running' ? (
              <StatusPill label="running" tone="blue" live />
            ) : (
              <StatusPill label="idle" tone="neutral" />
            )}
          </div>
          <div className="chat-meta">
            <span className="mono">{agent?.name ?? 'Forge'}</span>
            <span className="mono">{modelLabel(store.settings.s2Model)}</span>
            <span className="mono">jev · {store.settings.jevModel}</span>
            {(chat.skillIds ?? []).length ? (
              <span className="mono">{chat.skillIds?.length} skills</span>
            ) : null}
            <span>
              {stats.traces} decisions · {stats.escalations} escalations
              {stats.direct ? ` · ${stats.direct} direct` : ''}
            </span>
          </div>
        </div>
        <div className="chat-actions">
          <button type="button" className="icon-btn" onClick={() => store.togglePin(chat.id)} aria-label={chat.pinned ? 'Unpin' : 'Pin'}>
            <Pin size={15} className={chat.pinned ? 'pinned' : ''} />
          </button>
          <button type="button" className="icon-btn" onClick={exportChat} aria-label="Export chat">
            <Download size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              store.deleteChat(chat.id)
              onNavigate({ name: 'chats' })
            }}
            aria-label="Delete chat"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="chat-body">
        <div className="thread-scroll">
          <div className="thread">
            {chat.messages.map((message) => (
              <MessageView
                key={message.id}
                message={message}
                onApprove={approve}
                onDeny={deny}
                onNavigate={onNavigate}
              />
            ))}
            {chat.status === 'running' && !pendingApproval ? (
              <div className="working">
                <Loader2 size={13} className="spin" />
                {activeStep ?? 'Working'}
                {elapsed > 1 ? <span className="working-time">{elapsed}s</span> : null}
              </div>
            ) : null}
          </div>

          <div className="composer-dock">
            {scheduledHere.length ? (
              <div className="scheduled-strip">
                <CalendarClock size={11} />
                {scheduledHere.map((item) => (
                  <span key={item.id} className="scheduled-chip" title={item.text}>
                    {new Date(item.sendAt).toLocaleString([], {
                      weekday: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    <button
                      type="button"
                      aria-label="Cancel scheduled send"
                      onClick={() => store.cancelScheduled(item.id)}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {pendingApproval ? (
              <div className="gate-hint">
                <ShieldAlert size={13} /> Waiting on you: {pendingApproval.title}
              </div>
            ) : null}
            <Composer
              mode={mode}
              onModeChange={setMode}
              think={think}
              onThinkChange={setThink}
              agent={agent}
              disabled={disabled}
              placeholder={
                chat.status === 'waiting'
                  ? 'Resolve the approval to continue'
                  : chat.status === 'running'
                    ? 'The agent is working…'
                    : 'Ask a follow-up, or force System 2 with Think harder'
              }
              onSubmit={(text, _attachments, skills, toolCalls, scheduleAt) => {
                if (scheduleAt) {
                  store.scheduleSend({
                    chatId: chat.id,
                    text,
                    skillIds: skills.map((skill) => skill.id),
                    toolCalls,
                    sendAt: scheduleAt,
                  })
                  store.notify(
                    `Scheduled for ${new Date(scheduleAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
                  )
                  return
                }
                void run(text, think, skills, toolCalls)
              }}
              onOpenIntegrations={() => onNavigate({ name: 'integrations' })}
            />
            <p className="dock-note">
              <span className="dot" />{' '}
              {store.settings.runtime === 'simulated'
                ? 'simulated runtime'
                : system1Ready
                  ? 'live · dual process'
                  : 'live · direct agent'} · workspace saved to D1 · keys stay in the Worker
            </p>
          </div>
        </div>

        <aside className="chat-side">
          <Tabs
            tabs={[
              { id: 'overview', label: 'Trace' },
              { id: 'plan', label: 'Plan', count: plan.length },
              { id: 'artifacts', label: 'Artifacts', count: stats.artifacts.length },
            ]}
            value={sideTab}
            onChange={setSideTab}
          />

          <div className="side-body">
            {sideTab === 'overview' ? (
              <>
                <section className="side-section">
                  <h3>This chat</h3>
                  <div className="stat-rows">
                    <div><span>Typed decisions</span><span className="mono">{stats.traces}</span></div>
                    <div><span>Direct agent</span><span className="mono">{stats.direct}</span></div>
                    <div><span>Escalations</span><span className="mono">{stats.escalations}</span></div>
                    <div><span>Fast path</span><span className="mono">{stats.fastPath}%</span></div>
                    <div><span>Tools</span><span className="mono">{stats.tools}</span></div>
                    <div>
                      <span>{stats.saved >= 0 ? 'Saved' : 'Spent'}</span>
                      <span className={cn('mono', stats.saved >= 0 ? 'saved' : 'spent')}>
                        {money(Math.abs(stats.saved))}
                      </span>
                    </div>
                  </div>
                  <p className="tiny faint">Compared with sending every turn straight to System 2.</p>
                </section>

                <section className="side-section">
                  <h3>System 1</h3>
                  <div className="s1-card">
                    <div className="s1-head"><Zap size={13} /> <span className="mono">{store.settings.jevModel}</span></div>
                    <p>Typed questions over the workspace state. No prose, no tools of its own.</p>
                    <div className="stat-rows">
                      <div><span>Accept at</span><span className="mono">≥ {store.settings.thresholds.accept.toFixed(2)}</span></div>
                      <div><span>Escalate at</span><span className="mono">≥ {store.settings.thresholds.escalate.toFixed(2)}</span></div>
                      <div><span>Risk gate</span><span className="mono">≥ {store.settings.thresholds.risky.toFixed(2)}</span></div>
                    </div>
                    <button type="button" className="link-btn" onClick={() => onNavigate({ name: 'settings' })}>
                      Tune thresholds <ExternalLink size={11} />
                    </button>
                  </div>
                </section>

                <section className="side-section">
                  <h3>System 2</h3>
                  <div className="stat-rows">
                    <div><span>Model</span><span className="mono">{modelLabel(store.settings.s2Model)}</span></div>
                    <div><span>Effort</span><span className="mono">{store.settings.effort}</span></div>
                    <div><span>Posture</span><span className="mono">{store.settings.posture}</span></div>
                  </div>
                </section>
              </>
            ) : null}

            {sideTab === 'plan' ? (
              <section className="side-section">
                <h3>Plan</h3>
                {plan.length ? (
                  <ul className="insp-steps">
                    {plan.map((step) => (
                      <li key={step.id} className={`step-${step.status}`}>
                        {step.status === 'done' ? <CircleCheck size={13} /> : null}
                        {step.status === 'active' ? <Loader2 size={13} className="spin" /> : null}
                        {step.status === 'pending' ? <Circle size={13} /> : null}
                        {step.status === 'blocked' ? <CircleAlert size={13} /> : null}
                        <span>{step.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="tiny faint">System 2 writes a plan when the turn needs one.</p>
                )}
              </section>
            ) : null}

            {sideTab === 'artifacts' ? (
              <section className="side-section">
                <h3>Artifacts</h3>
                {stats.artifacts.length ? (
                  stats.artifacts.map((artifact) =>
                    artifact.kind === 'artifact' ? (
                      <button
                        key={artifact.id}
                        type="button"
                        className="side-artifact"
                        onClick={() =>
                          onNavigate(
                            artifact.target === 'canvas'
                              ? { name: 'canvas', path: artifact.canvasId }
                              : { name: artifact.target === 'media' ? 'media' : 'files' },
                          )
                        }
                      >
                        <FileText size={13} />
                        <span>
                          <strong>{artifact.name}</strong>
                          <span className="tiny faint">{artifact.type} · {artifact.meta}</span>
                        </span>
                        <ChevronRight size={12} />
                      </button>
                    ) : null,
                  )
                ) : (
                  <p className="tiny faint">Drafts, reports and transcripts land here.</p>
                )}
              </section>
            ) : null}
          </div>

          <footer className="side-foot">
            <span className="dot dot-live" /> event log · {chat.messages.length} items
          </footer>
        </aside>
      </div>
    </div>
  )
}

function MessageView({
  message,
  onApprove,
  onDeny,
  onNavigate,
}: {
  message: ChatMessage
  onApprove: (message: Extract<ChatMessage, { kind: 'approval' }>) => void
  onDeny: (message: Extract<ChatMessage, { kind: 'approval' }>) => void
  onNavigate: (view: View) => void
}) {
  switch (message.kind) {
    case 'user':
      return (
        <div className="msg msg-user">
          <span className="msg-avatar">you</span>
          <div className="msg-bubble">
            {message.text}
            {message.skills?.length ? (
              <div className="msg-skills">
                {message.skills.map((skill) => (
                  <span key={skill.id} className="token-chip token-skill">
                    <Sparkles size={10} /> /{skill.slug}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )
    case 'trace':
      return <div className="msg-trace"><TraceCard trace={message.trace} /></div>
    case 'assistant':
      return (
        <div className="msg msg-assistant">
          <span className={cn('msg-avatar', message.system === 's2' ? 'violet' : 'lime')}>
            {message.system === 's2' ? <Brain size={13} /> : <Zap size={13} />}
          </span>
          <div className="msg-body">
            <div className="msg-byline">
              {message.thinking ? 'Thinking' : message.system === 's2' ? 'System 2' : 'System 1'} · {message.at}
              {message.template ? <Chip tone="neutral">template</Chip> : null}
            </div>
            {message.thinking ? (
              <div className="thought">
                <Markdown text={message.text} />
              </div>
            ) : (
              <Markdown text={message.text} />
            )}
            {message.streaming ? <span className="caret" /> : null}
          </div>
        </div>
      )
    case 'plan':
      return (
        <div className="plan-card">
          <header>
            <span>Plan</span>
            <span className="mono faint">
              {message.steps.filter((step) => step.status === 'done').length}/{message.steps.length}
            </span>
          </header>
          <ul>
            {message.steps.map((step) => (
              <li key={step.id} className={`step-${step.status}`}>
                {step.status === 'done' ? <CircleCheck size={12} /> : step.status === 'active' ? <Loader2 size={12} className="spin" /> : step.status === 'blocked' ? <CircleAlert size={12} /> : <Circle size={12} />}
                <span>{step.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'steps':
      return <StepsCard message={message} />
    case 'tool':
      return <ToolCard message={message} />
    case 'approval':
      return (
        <div className={cn('approval', `state-${message.status}`)}>
          <header>
            <ShieldAlert size={14} />
            <span>{message.status === 'pending' ? 'Approval needed' : message.status === 'approved' ? 'Approved' : 'Denied'}</span>
            <Chip tone={message.risk === 'high' ? 'red' : message.risk === 'medium' ? 'amber' : 'neutral'}>{message.risk} risk</Chip>
            {message.decision ? <span className="approval-decision mono">{message.decision}</span> : null}
          </header>
          <h3>{message.title}</h3>
          <p>{message.detail}</p>
          <ul className="approval-scope">
            {message.scope.map((scope) => <li key={scope} className="mono">{scope}</li>)}
          </ul>
          {message.status === 'pending' ? (
            <div className="approval-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onApprove(message)}>
                <Check size={12} /> Approve once
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onDeny(message)}>
                <X size={12} /> Deny
              </button>
            </div>
          ) : null}
        </div>
      )
    case 'artifact':
      return (
        <button
          type="button"
          className="artifact"
          onClick={() =>
            onNavigate(
              message.target === 'canvas'
                ? { name: 'canvas', path: message.canvasId }
                : { name: message.target === 'media' ? 'media' : 'files' },
            )
          }
        >
          <span className="artifact-icon">
            {message.target === 'canvas' ? <Frame size={14} /> : <FileText size={14} />}
          </span>
          <span className="artifact-copy">
            <span className="artifact-name">{message.name}</span>
            <span className="artifact-meta">{message.type} · {message.meta}</span>
          </span>
          <span className="artifact-open">open <ExternalLink size={11} /></span>
        </button>
      )
    case 'notice':
      return <div className="notice">{message.text}</div>
    default:
      return null
  }
}

function StepsCard({ message }: { message: Extract<ChatMessage, { kind: 'steps' }> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const steps = message.steps
  if (!steps.length) return null
  const finished = steps.filter((step) => step.status !== 'running').length

  return (
    <div className="steps-card">
      <header>
        <ListChecks size={12} />
        <span>Action log</span>
        <span className="mono faint">
          {finished}/{steps.length}
        </span>
      </header>
      <ol>
        {steps.map((step) => {
          const expandable = Boolean(step.detail || step.input || step.output)
          const open = openId === step.id
          return (
            <li key={step.id} className={cn('step-row', `is-${step.status}`)}>
              <button
                type="button"
                className="step-head"
                onClick={() => setOpenId(open ? null : step.id)}
                aria-expanded={open}
                disabled={!expandable}
              >
                <span className="step-mark">
                  {step.status === 'running' ? (
                    <Loader2 size={11} className="spin" />
                  ) : step.status === 'error' ? (
                    <CircleAlert size={11} />
                  ) : (
                    <CircleCheck size={11} />
                  )}
                </span>
                <span className="step-label">{step.label}</span>
                <span className="step-ms mono">
                  {step.status === 'running' ? 'running' : step.ms ? `${(step.ms / 1000).toFixed(2)}s` : ''}
                </span>
                {expandable ? open ? <ChevronDown size={11} /> : <ChevronRight size={11} /> : <span className="step-spacer" />}
              </button>
              {open && expandable ? (
                <div className="step-detail">
                  {step.detail ? <p>{step.detail}</p> : null}
                  {step.input ? (
                    <div>
                      <span className="step-detail-key mono">in</span>
                      <pre className="mono">{step.input}</pre>
                    </div>
                  ) : null}
                  {step.output ? (
                    <div>
                      <span className="step-detail-key mono">out</span>
                      <pre className="mono">{step.output}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function buildWorkspaceContext(files: WorkspaceFile[]): TurnWorkspace {
  const roots = [...new Set(files.map((file) => file.path.split('/')[0]).filter(Boolean))].sort()
  let budget = 18_000
  const bounded = files.map((file) => {
    const raw = file.text?.trim() ?? ''
    if (!raw || budget <= 0) return { path: file.path, bytes: file.bytes }
    const text = raw.slice(0, Math.min(4_000, budget))
    budget -= text.length
    return { path: file.path, bytes: file.bytes, text }
  })
  return {
    files: bounded,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    roots,
  }
}

function ToolCard({ message }: { message: Extract<ChatMessage, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(true)
  const Icon = message.name.startsWith('jobs')
    ? Terminal
    : message.name.startsWith('files')
      ? FileText
      : message.name.startsWith('media')
        ? Sparkles
        : Terminal

  return (
    <div className={cn('tool', `tool-${message.status}`)}>
      <button type="button" className="tool-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="tool-icon"><Icon size={13} /></span>
        <span className="tool-name mono">{message.name}</span>
        <span className="tool-title">{message.title}</span>
        <span className="tool-status">
          {message.status === 'running' ? <Loader2 size={12} className="spin" /> : <CircleCheck size={12} />}
          {message.ms ? `${(message.ms / 1000).toFixed(2)}s` : message.status}
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && message.input ? <div className="tool-input mono">{message.input}</div> : null}
      {open && message.output ? <pre className="tool-output">{message.output}</pre> : null}
      {open && message.diff ? <DiffList diffs={message.diff} /> : null}
    </div>
  )
}

function DiffList({ diffs }: { diffs: FileDiff[] }) {
  return (
    <div className="diff-list">
      {diffs.map((diff) => (
        <div key={diff.file}>
          <div className="diff-head mono">
            {diff.file} <span className="add">+{diff.additions}</span> <span className="del">−{diff.deletions}</span>
          </div>
          <div className="diff-lines">
            {diff.lines.map((line, index) => (
              <div key={index} className={cn('diff-line', `is-${line.t}`)}>
                <span className="diff-sign">{line.t === 'add' ? '+' : line.t === 'del' ? '−' : ' '}</span>
                <span className="mono">{line.text || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function stamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function lastProse(chat: Chat): string {
  const assistant = [...chat.messages].reverse().find((message) => message.kind === 'assistant')
  return assistant && assistant.kind === 'assistant' ? assistant.text : 'Draft generated by the workspace agent.'
}
