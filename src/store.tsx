import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError } from './lib/api'
import { defaultSkills, defaultWorkspace, lanes, quotas } from './data/defaults'
import { providers as providerCatalog } from './data/providers'
import type {
  Agent,
  ApiKeyMeta,
  ApprovalPosture,
  Automation,
  Canvas,
  CanvasDraft,
  Chat,
  ChatMessage,
  Job,
  KeyEvent,
  Lane,
  McpCallResult,
  McpServer,
  McpToolCall,
  McpTransport,
  MediaItem,
  Provider,
  ProviderStatus,
  Quota,
  ScheduledSend,
  SessionUser,
  Settings,
  Skill,
  WorkspaceFile,
  WorkspaceSnapshot,
} from './types'

export type AuthStatus = 'loading' | 'anon' | 'authed'
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface QueueItem {
  text: string
  skillIds: string[]
  toolCalls: McpToolCall[]
}

export interface UsageSummary {
  spend: number
  saved: number
  decisions: number
  escalations: number
  fastPath: number
  promptTokens: number
}

interface StoreValue {
  /* session */
  status: AuthStatus
  user: SessionUser | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>

  /* workspace */
  chats: Chat[]
  files: WorkspaceFile[]
  canvases: Canvas[]
  scheduled: ScheduledSend[]
  jobs: Job[]
  media: MediaItem[]
  automations: Automation[]
  agents: Agent[]
  skills: Skill[]
  settings: Settings
  providers: Provider[]
  keys: ApiKeyMeta[]
  keyAudit: KeyEvent[]
  providerStatus: Record<string, ProviderStatus>
  mcpServers: McpServer[]
  lanes: Lane[]
  quotas: Quota[]
  usage: UsageSummary
  saveState: SaveState
  saveNow: () => Promise<void>
  reloadWorkspace: () => Promise<void>

  /* keys */
  refreshKeys: () => Promise<void>
  saveKey: (name: string, value: string, provider?: string) => Promise<void>
  deleteKey: (name: string) => Promise<void>

  /* mcp */
  addServer: (input: { name: string; url: string; transport: McpTransport; auth?: string }) => Promise<McpServer>
  updateServer: (id: string, patch: Record<string, unknown>) => Promise<McpServer>
  removeServer: (id: string) => Promise<void>
  refreshServer: (id: string) => Promise<McpServer>
  callTool: (id: string, tool: string, args: Record<string, unknown>) => Promise<McpCallResult>

  /* canvas + scheduled sends */
  addCanvas: (draft: CanvasDraft & { origin?: 'agent' | 'user'; chatId?: string }) => Canvas
  patchCanvas: (id: string, patch: Partial<Canvas>) => void
  deleteCanvas: (id: string) => void
  scheduleSend: (input: {
    chatId: string | null
    text: string
    skillIds?: string[]
    toolCalls?: McpToolCall[]
    sendAt: number
  }) => ScheduledSend
  cancelScheduled: (id: string) => void

  /* workspace mutations */
  notify: (message: string) => void
  toast: string | null
  createChat: (
    prompt: string,
    agentId?: string,
    skillIds?: string[],
    toolCalls?: McpToolCall[],
  ) => string
  patchChat: (id: string, patch: Partial<Chat>) => void
  updateChat: (id: string, updater: (chat: Chat) => Chat) => void
  appendMessage: (id: string, message: ChatMessage) => void
  patchMessage: (chatId: string, messageId: string, patch: Record<string, unknown>) => void
  deleteChat: (id: string) => void
  togglePin: (id: string) => void
  queuePrompt: Record<string, QueueItem>
  takeQueuedPrompt: (id: string) => QueueItem | undefined
  writeFile: (path: string, text: string, origin?: 'agent' | 'user') => void
  deleteFile: (path: string) => void
  patchJob: (id: string, patch: Partial<Job>) => void
  addJob: (job: Job) => void
  patchMedia: (id: string, patch: Partial<MediaItem>) => void
  addMedia: (item: MediaItem) => void
  addAutomation: (automation: Automation) => void
  patchAutomation: (id: string, patch: Partial<Automation>) => void
  deleteAutomation: (id: string) => void
  patchAgent: (id: string, patch: Partial<Agent>) => void
  patchSettings: (patch: Partial<Settings>) => void
  setPosture: (posture: ApprovalPosture) => void
  addSkill: (draft: Pick<Skill, 'name' | 'description' | 'prompt'>) => Skill
  patchSkill: (id: string, patch: Partial<Skill>) => void
  deleteSkill: (id: string) => void
}

const Ctx = createContext<StoreValue | null>(null)

const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong'

function slugify(name: string, taken: string[]): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'skill'
  if (!taken.includes(base)) return base
  let index = 2
  while (taken.includes(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<SessionUser | null>(null)

  const [chats, setChats] = useState<Chat[]>(() => defaultWorkspace().chats)
  const [files, setFiles] = useState<WorkspaceFile[]>(() => defaultWorkspace().files)
  const [jobs, setJobs] = useState<Job[]>([])
  const [media, setMedia] = useState<MediaItem[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [agents, setAgents] = useState<Agent[]>(() => defaultWorkspace().agents)
  const [skills, setSkills] = useState<Skill[]>(() => defaultSkills.map((item) => ({ ...item })))
  const [canvases, setCanvases] = useState<Canvas[]>(() => defaultWorkspace().canvases)
  const [scheduled, setScheduled] = useState<ScheduledSend[]>([])
  const [settings, setSettings] = useState<Settings>(() => defaultWorkspace().settings)

  const [keys, setKeys] = useState<ApiKeyMeta[]>([])
  const [keyAudit, setKeyAudit] = useState<KeyEvent[]>([])
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>({})
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])

  const [toast, setToast] = useState<string | null>(null)
  const [queuePrompt, setQueuePrompt] = useState<Record<string, QueueItem>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const hydrated = useRef(false)
  const loadingFor = useRef<string | null>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3600)
  }, [])

  const applySnapshot = useCallback((raw: WorkspaceSnapshot) => {
    const base = defaultWorkspace()
    setChats(Array.isArray(raw.chats) ? raw.chats : base.chats)
    setFiles(Array.isArray(raw.files) ? raw.files : base.files)
    setJobs(Array.isArray(raw.jobs) ? raw.jobs : base.jobs)
    setMedia(Array.isArray(raw.media) ? raw.media : base.media)
    setAutomations(Array.isArray(raw.automations) ? raw.automations : base.automations)
    setAgents(Array.isArray(raw.agents) && raw.agents.length ? raw.agents : base.agents)
    setSkills(Array.isArray(raw.skills) ? raw.skills : base.skills)
    setCanvases(Array.isArray(raw.canvases) ? raw.canvases : base.canvases)
    setScheduled(Array.isArray(raw.scheduled) ? raw.scheduled : [])
    const incoming = (raw.settings ?? {}) as Partial<Settings>
    setSettings({
      ...base.settings,
      ...incoming,
      thresholds: { ...base.settings.thresholds, ...(incoming.thresholds ?? {}) },
    })
  }, [])

  const resetWorkspace = useCallback(() => {
    const base = defaultWorkspace()
    setChats(base.chats)
    setFiles(base.files)
    setJobs(base.jobs)
    setMedia(base.media)
    setAutomations(base.automations)
    setAgents(base.agents)
    setSkills(base.skills)
    setCanvases(base.canvases)
    setScheduled([])
    setSettings(base.settings)
    setQueuePrompt({})
    setSaveState('idle')
  }, [])

  const loadWorkspace = useCallback(async () => {
    const { workspace } = await api.workspace()
    applySnapshot(workspace)
  }, [applySnapshot])

  const refreshKeys = useCallback(async () => {
    const inventory = await api.keys()
    setKeys(inventory.keys)
    setKeyAudit(inventory.audit)
    setProviderStatus(inventory.providers)
  }, [])

  /* Session bootstrap */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { user: session } = await api.me()
        if (cancelled) return
        setUser(session)
        setStatus('authed')
      } catch {
        if (!cancelled) setStatus('anon')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* Hydrate everything the account owns, once per session. */
  useEffect(() => {
    if (status !== 'authed' || !user) return
    if (loadingFor.current === user.id) return
    loadingFor.current = user.id
    hydrated.current = false
    void (async () => {
      try {
        await loadWorkspace()
        await Promise.all([
          refreshKeys().catch(() => undefined),
          api
            .mcpServers()
            .then((result) => setMcpServers(result.servers))
            .catch(() => undefined),
        ])
      } catch (error) {
        notify(`Workspace failed to load · ${messageOf(error)}`)
      } finally {
        hydrated.current = true
        setSaveState('saved')
      }
    })()
  }, [status, user, loadWorkspace, refreshKeys, notify])

  /* Persist the serializable workspace on a short debounce. */
  const snapshot = useMemo<WorkspaceSnapshot>(
    () => ({ chats, files, canvases, scheduled, jobs, media, automations, agents, skills, settings }),
    [chats, files, canvases, scheduled, jobs, media, automations, agents, skills, settings],
  )
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const firing = useRef<Set<string>>(new Set())

  const saveNow = useCallback(async () => {
    if (!hydrated.current) return
    try {
      await api.saveWorkspace(snapshotRef.current)
      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      notify(`Save failed · ${messageOf(error)}`)
    }
  }, [notify])

  useEffect(() => {
    if (!hydrated.current) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void api
        .saveWorkspace(snapshot)
        .then(() => setSaveState('saved'))
        .catch((error) => {
          setSaveState('error')
          notify(`Save failed · ${messageOf(error)}`)
        })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [snapshot, notify])

  useEffect(() => {
    const flush = () => {
      if (!hydrated.current) return
      void api.saveWorkspace(snapshotRef.current).catch(() => undefined)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  /* Auth actions */
  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password)
    loadingFor.current = null
    setUser(result.user)
    setStatus('authed')
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.register(name, email, password)
    loadingFor.current = null
    setUser(result.user)
    setStatus('authed')
  }, [])

  const signOut = useCallback(async () => {
    await saveNow().catch(() => undefined)
    await api.logout().catch(() => undefined)
    hydrated.current = false
    loadingFor.current = null
    resetWorkspace()
    setKeys([])
    setKeyAudit([])
    setProviderStatus({})
    setMcpServers([])
    setUser(null)
    setStatus('anon')
  }, [saveNow, resetWorkspace])

  /* Keys */
  const saveKey = useCallback(
    async (name: string, value: string, provider?: string) => {
      await api.saveKey(name, value, provider)
      await refreshKeys()
    },
    [refreshKeys],
  )

  const deleteKey = useCallback(
    async (name: string) => {
      await api.deleteKey(name)
      await refreshKeys()
    },
    [refreshKeys],
  )

  /* MCP */
  const addServer = useCallback(
    async (input: { name: string; url: string; transport: McpTransport; auth?: string }) => {
      const { server } = await api.createMcp(input)
      setMcpServers((prev) => [server, ...prev.filter((item) => item.id !== server.id)])
      return server
    },
    [],
  )

  const updateServer = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const { server } = await api.updateMcp(id, patch)
    setMcpServers((prev) => prev.map((item) => (item.id === id ? server : item)))
    return server
  }, [])

  const removeServer = useCallback(async (id: string) => {
    await api.deleteMcp(id)
    setMcpServers((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const refreshServer = useCallback(async (id: string) => {
    const { server } = await api.refreshMcp(id)
    setMcpServers((prev) => prev.map((item) => (item.id === id ? server : item)))
    return server
  }, [])

  const callTool = useCallback(
    (id: string, tool: string, args: Record<string, unknown>) => api.callMcp(id, tool, args),
    [],
  )

  /* Chats */
  const createChat = useCallback(
    (prompt: string, agentId = 'forge', skillIds: string[] = [], toolCalls: McpToolCall[] = []) => {
    const id = `chat_${Math.random().toString(36).slice(2, 9)}`
    const title = prompt.length > 58 ? `${prompt.slice(0, 55)}…` : prompt
    const chat: Chat = {
      id,
      title: title || 'New chat',
      pinned: false,
      status: 'running',
      agentId,
      preview: prompt,
      updated: 'just now',
      createdAt: 'Today',
      messages: [],
      tags: [],
      ...(skillIds.length ? { skillIds } : {}),
    }
    setChats((prev) => [chat, ...prev])
    setQueuePrompt((prev) => ({ ...prev, [id]: { text: prompt, skillIds, toolCalls } }))
    return id
    },
    [],
  )

  /* Scheduled sends fire while an account is signed in. */
  useEffect(() => {
    if (status !== 'authed') return
    const fire = () => {
      const now = Date.now()
      const due = scheduled.filter((item) => item.sendAt <= now && !firing.current.has(item.id))
      if (!due.length) return
      due.forEach((item) => firing.current.add(item.id))
      setScheduled((prev) => prev.filter((item) => !due.some((pending) => pending.id === item.id)))
      for (const item of due) {
        const exists = Boolean(item.chatId && chatsRef.current.some((chat) => chat.id === item.chatId))
        const chatId = item.chatId
        if (exists && chatId) {
          setQueuePrompt((prev) => ({
            ...prev,
            [chatId]: { text: item.text, skillIds: item.skillIds, toolCalls: item.toolCalls },
          }))
        } else {
          const id = createChat(item.text, 'forge', item.skillIds, item.toolCalls)
          setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, status: 'idle' } : chat)))
        }
        notify('Scheduled message sent')
        window.setTimeout(() => firing.current.delete(item.id), 4000)
      }
    }
    fire()
    const timer = window.setInterval(fire, 15000)
    return () => window.clearInterval(timer)
  }, [status, scheduled, createChat, notify])

  const patchChat = useCallback((id: string, patch: Partial<Chat>) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, ...patch } : chat)))
  }, [])

  const updateChat = useCallback((id: string, updater: (chat: Chat) => Chat) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? updater(chat) : chat)))
  }, [])

  const appendMessage = useCallback((id: string, message: ChatMessage) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === id ? { ...chat, updated: 'just now', messages: [...chat.messages, message] } : chat,
      ),
    )
  }, [])

  const patchMessage = useCallback((chatId: string, messageId: string, patch: Record<string, unknown>) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId ? ({ ...message, ...patch } as ChatMessage) : message,
              ),
            }
          : chat,
      ),
    )
  }, [])

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
  }, [])

  const togglePin = useCallback((id: string) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)))
  }, [])

  const takeQueuedPrompt = useCallback(
    (id: string) => {
      const item = queuePrompt[id]
      if (!item) return undefined
      setQueuePrompt((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return item
    },
    [queuePrompt],
  )

  /* Files */
  const writeFile = useCallback((path: string, text: string, origin: 'agent' | 'user' = 'agent') => {
    setFiles((prev) => {
      const bytes = new TextEncoder().encode(text).length
      const next = prev.filter((file) => file.path !== path)
      return [...next, { path, text, bytes, updated: 'just now', origin }].sort((a, b) =>
        a.path.localeCompare(b.path),
      )
    })
  }, [])

  const deleteFile = useCallback((path: string) => {
    setFiles((prev) => prev.filter((file) => file.path !== path))
  }, [])

  /* Jobs, media, automations, agents */
  const patchJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)))
  }, [])
  const addJob = useCallback((job: Job) => setJobs((prev) => [job, ...prev]), [])
  const patchMedia = useCallback((id: string, patch: Partial<MediaItem>) => {
    setMedia((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])
  const addMedia = useCallback((item: MediaItem) => setMedia((prev) => [item, ...prev]), [])
  const addAutomation = useCallback((automation: Automation) => {
    setAutomations((prev) => [automation, ...prev])
  }, [])
  const patchAutomation = useCallback((id: string, patch: Partial<Automation>) => {
    setAutomations((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])
  const deleteAutomation = useCallback((id: string) => {
    setAutomations((prev) => prev.filter((item) => item.id !== id))
  }, [])
  const patchAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setAgents((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  /* Settings */
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])
  const setPosture = useCallback((posture: ApprovalPosture) => {
    setSettings((prev) => ({ ...prev, posture }))
  }, [])

  /* Skills */
  const addSkill = useCallback((draft: Pick<Skill, 'name' | 'description' | 'prompt'>) => {
    const skill: Skill = {
      id: `skill_${Math.random().toString(36).slice(2, 9)}`,
      name: draft.name.trim(),
      slug: '',
      description: draft.description.trim(),
      prompt: draft.prompt.trim(),
      enabled: true,
    }
    setSkills((prev) => {
      skill.slug = slugify(skill.name, prev.map((item) => item.slug))
      return [...prev, skill]
    })
    return skill
  }, [])

  const patchSkill = useCallback((id: string, patch: Partial<Skill>) => {
    setSkills((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (patch.name !== undefined && patch.slug === undefined) {
          next.slug = slugify(patch.name, prev.filter((other) => other.id !== id).map((other) => other.slug))
        }
        return next
      }),
    )
  }, [])

  const deleteSkill = useCallback((id: string) => {
    setSkills((prev) => prev.filter((item) => item.id !== id))
  }, [])

  /* Canvases */
  const addCanvas = useCallback((draft: CanvasDraft & { origin?: 'agent' | 'user'; chatId?: string }) => {
    const canvas: Canvas = {
      id: `canvas_${Math.random().toString(36).slice(2, 9)}`,
      name: draft.name.trim() || 'Untitled canvas',
      description: draft.description.trim(),
      html: draft.html,
      css: draft.css,
      js: draft.js,
      origin: draft.origin ?? 'user',
      updatedAt: Date.now(),
      ...(draft.chatId ? { chatId: draft.chatId } : {}),
    }
    setCanvases((prev) => [canvas, ...prev])
    return canvas
  }, [])

  const patchCanvas = useCallback((id: string, patch: Partial<Canvas>) => {
    setCanvases((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)),
    )
  }, [])

  const deleteCanvas = useCallback((id: string) => {
    setCanvases((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const scheduleSend = useCallback(
    (input: {
      chatId: string | null
      text: string
      skillIds?: string[]
      toolCalls?: McpToolCall[]
      sendAt: number
    }) => {
      const item: ScheduledSend = {
        id: `send_${Math.random().toString(36).slice(2, 9)}`,
        chatId: input.chatId,
        text: input.text,
        skillIds: input.skillIds ?? [],
        toolCalls: input.toolCalls ?? [],
        sendAt: input.sendAt,
      }
      setScheduled((prev) => [...prev, item].sort((a, b) => a.sendAt - b.sendAt))
      return item
    },
    [],
  )

  const cancelScheduled = useCallback((id: string) => {
    setScheduled((prev) => prev.filter((item) => item.id !== id))
  }, [])

  /* Derived */
  const providers = useMemo<Provider[]>(
    () =>
      providerCatalog.map((definition) => {
        const state = providerStatus[definition.id]
        return {
          id: definition.id,
          name: definition.name,
          mark: definition.mark,
          status: state?.configured ? 'connected' : 'missing',
          ...(state?.masked ? { keyMask: state.masked } : {}),
          models: definition.models,
          note: definition.note,
          tone: definition.tone,
          ...(state?.source ? { source: state.source } : {}),
        }
      }),
    [providerStatus],
  )

  const usage = useMemo<UsageSummary>(() => {
    let spend = 0
    let saved = 0
    let decisions = 0
    let escalations = 0
    let promptTokens = 0
    for (const chat of chats) {
      for (const message of chat.messages) {
        if (message.kind !== 'trace') continue
        decisions += 1
        promptTokens += message.trace.s1.promptTokens
        spend += message.trace.s1.costUsd + (message.trace.escalation?.s2.costUsd ?? 0)
        saved += message.trace.savedUsd
        if (message.trace.route === 's2') escalations += 1
      }
    }
    return {
      spend,
      saved,
      decisions,
      escalations,
      promptTokens,
      fastPath: decisions ? Math.round(((decisions - escalations) / decisions) * 100) : 100,
    }
  }, [chats])

  const value = useMemo<StoreValue>(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signOut,
      chats,
      files,
      canvases,
      scheduled,
      jobs,
      media,
      automations,
      agents,
      skills,
      settings,
      providers,
      keys,
      keyAudit,
      providerStatus,
      mcpServers,
      lanes,
      quotas,
      usage,
      saveState,
      saveNow,
      reloadWorkspace: loadWorkspace,
      refreshKeys,
      saveKey,
      deleteKey,
      addServer,
      updateServer,
      removeServer,
      refreshServer,
      callTool,
      addCanvas,
      patchCanvas,
      deleteCanvas,
      scheduleSend,
      cancelScheduled,
      notify,
      toast,
      createChat,
      patchChat,
      updateChat,
      appendMessage,
      patchMessage,
      deleteChat,
      togglePin,
      queuePrompt,
      takeQueuedPrompt,
      writeFile,
      deleteFile,
      patchJob,
      addJob,
      patchMedia,
      addMedia,
      addAutomation,
      patchAutomation,
      deleteAutomation,
      patchAgent,
      patchSettings,
      setPosture,
      addSkill,
      patchSkill,
      deleteSkill,
    }),
    [
      status,
      user,
      signIn,
      signUp,
      signOut,
      chats,
      files,
      canvases,
      scheduled,
      jobs,
      media,
      automations,
      agents,
      skills,
      settings,
      providers,
      keys,
      keyAudit,
      providerStatus,
      mcpServers,
      usage,
      saveState,
      saveNow,
      loadWorkspace,
      refreshKeys,
      saveKey,
      deleteKey,
      addServer,
      updateServer,
      removeServer,
      refreshServer,
      callTool,
      addCanvas,
      patchCanvas,
      deleteCanvas,
      scheduleSend,
      cancelScheduled,
      notify,
      toast,
      createChat,
      patchChat,
      updateChat,
      appendMessage,
      patchMessage,
      deleteChat,
      togglePin,
      queuePrompt,
      takeQueuedPrompt,
      writeFile,
      deleteFile,
      patchJob,
      addJob,
      patchMedia,
      addMedia,
      addAutomation,
      patchAutomation,
      deleteAutomation,
      patchAgent,
      patchSettings,
      setPosture,
      addSkill,
      patchSkill,
      deleteSkill,
    ],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <div className="toast">{toast}</div> : null}
    </Ctx.Provider>
  )
}

export function useStore(): StoreValue {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore must be used inside StoreProvider')
  return store
}

export const nowStamp = stamp
