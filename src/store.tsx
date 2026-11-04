import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  agents as seedAgents,
  audit as seedAudit,
  automations as seedAutomations,
  chats as seedChats,
  files as seedFiles,
  integrations as seedIntegrations,
  jobs as seedJobs,
  lanes as seedLanes,
  media as seedMedia,
  providers as seedProviders,
  quotas as seedQuotas,
  secrets as seedSecrets,
  settings as seedSettings,
} from './data/mock'
import type {
  Agent,
  ApprovalPosture,
  AuditEvent,
  Automation,
  Chat,
  ChatMessage,
  Integration,
  Job,
  MediaItem,
  Provider,
  Secret,
  Settings,
  WorkspaceFile,
} from './types'

export interface AppState {
  chats: Chat[]
  files: WorkspaceFile[]
  secrets: Secret[]
  audit: AuditEvent[]
  jobs: Job[]
  media: MediaItem[]
  automations: Automation[]
  integrations: Integration[]
  agents: Agent[]
  providers: Provider[]
  lanes: typeof seedLanes
  quotas: typeof seedQuotas
  settings: Settings
  toast: string | null
}

interface StoreValue extends AppState {
  notify: (message: string) => void
  createChat: (prompt: string, agentId?: string) => string
  patchChat: (id: string, patch: Partial<Chat>) => void
  updateChat: (id: string, updater: (chat: Chat) => Chat) => void
  appendMessage: (id: string, message: ChatMessage) => void
  patchMessage: (chatId: string, messageId: string, patch: Record<string, unknown>) => void
  deleteChat: (id: string) => void
  togglePin: (id: string) => void
  queuePrompt: Record<string, string>
  takeQueuedPrompt: (id: string) => string | undefined
  writeFile: (path: string, text: string, origin?: 'agent' | 'user') => void
  deleteFile: (path: string) => void
  addSecret: (secret: Omit<Secret, 'id' | 'updated'>) => void
  revealSecret: (id: string) => string | null
  deleteSecret: (id: string) => void
  patchJob: (id: string, patch: Partial<Job>) => void
  addJob: (job: Job) => void
  patchMedia: (id: string, patch: Partial<MediaItem>) => void
  addMedia: (item: MediaItem) => void
  addAutomation: (automation: Automation) => void
  patchAutomation: (id: string, patch: Partial<Automation>) => void
  deleteAutomation: (id: string) => void
  patchIntegration: (id: string, patch: Partial<Integration>) => void
  addIntegration: (integration: Integration) => void
  patchAgent: (id: string, patch: Partial<Agent>) => void
  patchSettings: (patch: Partial<Settings>) => void
  setPosture: (posture: ApprovalPosture) => void
  toast: string | null
}

const Ctx = createContext<StoreValue | null>(null)

const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

export function StoreProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(seedChats)
  const [files, setFiles] = useState<WorkspaceFile[]>(seedFiles)
  const [secrets, setSecrets] = useState<Secret[]>(seedSecrets)
  const [audit, setAudit] = useState<AuditEvent[]>(seedAudit)
  const [jobs, setJobs] = useState<Job[]>(seedJobs)
  const [media, setMedia] = useState<MediaItem[]>(seedMedia)
  const [automations, setAutomations] = useState<Automation[]>(seedAutomations)
  const [integrations, setIntegrations] = useState<Integration[]>(seedIntegrations)
  const [agents, setAgents] = useState<Agent[]>(seedAgents)
  const [providers] = useState<Provider[]>(seedProviders)
  const [settings, setSettings] = useState<Settings>(seedSettings)
  const [toast, setToast] = useState<string | null>(null)
  const [queuePrompt, setQueuePrompt] = useState<Record<string, string>>({})

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200)
  }, [])

  const createChat = useCallback((prompt: string, agentId = 'forge') => {
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
    }
    setChats((prev) => [chat, ...prev])
    setQueuePrompt((prev) => ({ ...prev, [id]: prompt }))
    return id
  }, [])

  const patchChat = useCallback((id: string, patch: Partial<Chat>) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, ...patch } : chat)))
  }, [])

  const updateChat = useCallback((id: string, updater: (chat: Chat) => Chat) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? updater(chat) : chat)))
  }, [])

  const appendMessage = useCallback((id: string, message: ChatMessage) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === id
          ? { ...chat, updated: 'just now', messages: [...chat.messages, message] }
          : chat,
      ),
    )
  }, [])

  const patchMessage = useCallback(
    (chatId: string, messageId: string, patch: Record<string, unknown>) => {
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
    },
    [],
  )

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
  }, [])

  const togglePin = useCallback((id: string) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)))
  }, [])

  const takeQueuedPrompt = useCallback(
    (id: string) => {
      const text = queuePrompt[id]
      if (!text) return undefined
      setQueuePrompt((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return text
    },
    [queuePrompt],
  )

  const writeFile = useCallback((path: string, text: string, origin: 'agent' | 'user' = 'agent') => {
    setFiles((prev) => {
      const bytes = new TextEncoder().encode(text).length
      const next = prev.filter((file) => file.path !== path)
      return [
        ...next,
        { path, text, bytes, updated: 'just now', origin },
      ].sort((a, b) => a.path.localeCompare(b.path))
    })
  }, [])

  const deleteFile = useCallback((path: string) => {
    setFiles((prev) => prev.filter((file) => file.path !== path))
  }, [])

  const addSecret = useCallback((secret: Omit<Secret, 'id' | 'updated'>) => {
    const created: Secret = {
      ...secret,
      id: `sec_${Math.random().toString(36).slice(2, 7)}`,
      updated: 'just now',
    }
    setSecrets((prev) => [...prev, created])
    setAudit((prev) => [
      { id: `a_${Math.random().toString(36).slice(2, 7)}`, action: 'created', key: secret.key, actor: 'amos-donn', at: 'just now', outcome: 'ok' },
      ...prev,
    ])
  }, [])

  const revealSecret = useCallback(
    (id: string) => {
      const secret = secrets.find((item) => item.id === id)
      if (!secret) return null
      setAudit((prev) => [
        { id: `a_${Math.random().toString(36).slice(2, 7)}`, action: 'revealed', key: secret.key, actor: 'amos-donn', at: 'just now', outcome: 'ok' },
        ...prev,
      ])
      return secret.value
    },
    [secrets],
  )

  const deleteSecret = useCallback((id: string) => {
    setSecrets((prev) => {
      const secret = prev.find((item) => item.id === id)
      if (secret) {
        setAudit((log) => [
          { id: `a_${Math.random().toString(36).slice(2, 7)}`, action: 'deleted', key: secret.key, actor: 'amos-donn', at: 'just now', outcome: 'ok' },
          ...log,
        ])
      }
      return prev.filter((item) => item.id !== id)
    })
  }, [])

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

  const patchIntegration = useCallback((id: string, patch: Partial<Integration>) => {
    setIntegrations((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const addIntegration = useCallback((integration: Integration) => {
    setIntegrations((prev) => [integration, ...prev])
  }, [])

  const patchAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setAgents((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const setPosture = useCallback((posture: ApprovalPosture) => {
    setSettings((prev) => ({ ...prev, posture }))
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      chats,
      files,
      secrets,
      audit,
      jobs,
      media,
      automations,
      integrations,
      agents,
      providers,
      lanes: seedLanes,
      quotas: seedQuotas,
      settings,
      toast,
      notify,
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
      addSecret,
      revealSecret,
      deleteSecret,
      patchJob,
      addJob,
      patchMedia,
      addMedia,
      addAutomation,
      patchAutomation,
      deleteAutomation,
      patchIntegration,
      addIntegration,
      patchAgent,
      patchSettings,
      setPosture,
    }),
    [
      chats,
      files,
      secrets,
      audit,
      jobs,
      media,
      automations,
      integrations,
      agents,
      providers,
      settings,
      toast,
      notify,
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
      addSecret,
      revealSecret,
      deleteSecret,
      patchJob,
      addJob,
      patchMedia,
      addMedia,
      addAutomation,
      patchAutomation,
      deleteAutomation,
      patchIntegration,
      patchAgent,
      patchSettings,
      setPosture,
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
