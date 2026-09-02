import { useEffect, useRef, useState, type FormEvent } from 'react'

import { createMobileApprovalClient, type MobileApprovalRequest } from './mobile-approval-client'
import { createMobileAttachmentClient, type MobileFileAttachment } from './mobile-attachment-client'
import { mobileCredentialStore } from './capacitor-mobile-credential-store'
import { connectMobileGateway } from './mobile-gateway-client'
import { BrandMark } from './components/brand-mark'
import { assistantTextPart, appendAssistantTextPart, chatMessageText, mergeFinalAssistantText, textPart, type ChatMessage } from './lib/chat-messages'
import { sanitizeComposerInput } from './lib/composer-input-sanitize'
import type { MobileCredentialStore } from './mobile-credential-store'
import { createMobilePromptClient, type MobilePromptGateway } from './mobile-prompt-client'
import { createMobileGatewayRestClient, type MobileGatewayRestConfig } from './mobile-gateway-rest'
import { createMobileSessionClient, loadMobileSessionHistory, type MobileGatewayRequest, type MobileSessionListItem, type MobileSessionRest } from './mobile-session-client'
import { createMobileToolActivityClient, type MobileToolActivity } from './mobile-tool-activity-client'
import type { MobileGatewaySocketConfig } from './mobile-gateway-transport'
import { parseMobileConnection, type MobileConnectionMode } from './mobile-connection'

interface IpadHomeProps {
  connectGateway?: (config: MobileGatewaySocketConfig) => Promise<MobileGatewayRequest & MobilePromptGateway & { close(): void }>
  createRestClient?: (config: MobileGatewayRestConfig) => MobileSessionRest
  credentialStore?: MobileCredentialStore
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export function IpadHome({ credentialStore = mobileCredentialStore, connectGateway = connectMobileGateway, createRestClient = createMobileGatewayRestClient }: IpadHomeProps) {
  const emulatorLoopbackEnabled = import.meta.env.VITE_MOBILE_EMULATOR_LOOPBACK === '1'
  const connectionOptions = emulatorLoopbackEnabled ? { allowEmulatorLoopback: true } : {}
  const [mode, setMode] = useState<MobileConnectionMode>('secure')
  const [backendAddress, setBackendAddress] = useState('')
  const [lanToken, setLanToken] = useState('')
  const [lanRiskConfirmed, setLanRiskConfirmed] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [gateway, setGateway] = useState<(MobileGatewayRequest & MobilePromptGateway & { close(): void; onState?: (handler: (state: string) => void) => () => void }) | null>(null)
  const [rest, setRest] = useState<MobileSessionRest | null>(null)
  const [sessions, setSessions] = useState<MobileSessionListItem[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeStoredSessionId, setActiveStoredSessionId] = useState<string | null>(null)
  const activeSessionRef = useRef({ runtimeSessionId: null as string | null, storedSessionId: null as string | null })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [approval, setApproval] = useState<MobileApprovalRequest | null>(null)
  const [toolActivities, setToolActivities] = useState<MobileToolActivity[]>([])

  useEffect(() => {
    if (!gateway || !rest || !sessionId || !activeStoredSessionId) {
      return
    }
    const expected = { runtimeSessionId: sessionId, storedSessionId: activeStoredSessionId }
    return gateway.on('session.replay.gap', raw => {
      const event = raw as { session_id?: unknown }
      if (event.session_id !== expected.runtimeSessionId) {
        return
      }
      void loadMobileSessionHistory(rest, expected.storedSessionId).then(history => {
        if (activeSessionRef.current.runtimeSessionId === expected.runtimeSessionId
          && activeSessionRef.current.storedSessionId === expected.storedSessionId) {
          setMessages(history)
        }
      }).catch(() => {})
    })
  }, [activeStoredSessionId, gateway, rest, sessionId])

  useEffect(() => {
    if (!gateway || !sessionId) {
      return
    }
    return createMobilePromptClient(gateway).onStream(sessionId, event => {
      setMessages(current => {
        const assistantIndex = current.findLastIndex(message => message.role === 'assistant' && message.pending)
        if (event.complete) {
          if (assistantIndex < 0) {
            return [...current, { id: `mobile-assistant-${Date.now()}`, parts: [assistantTextPart(event.text)], role: 'assistant' }]
          }
          return current.map((message, index) => index === assistantIndex
            ? { ...message, parts: mergeFinalAssistantText(message.parts, event.text), pending: false }
            : message)
        }
        if (assistantIndex < 0) {
          return [...current, { id: `mobile-assistant-${Date.now()}`, parts: [assistantTextPart(event.text)], pending: true, role: 'assistant' }]
        }
        return current.map((message, index) => index === assistantIndex
          ? { ...message, parts: appendAssistantTextPart(message.parts, event.text) }
          : message)
      })
    })
  }, [gateway, sessionId])

  function validateConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      parseMobileConnection(backendAddress, mode, connectionOptions)
      setConnectionMessage(
        mode === 'lan'
          ? 'LAN endpoint validated. Token has not been saved.'
          : 'Secure endpoint validated. Sign-in is not configured.'
      )
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to validate backend URL')
    }
  }

  async function saveLanToken() {
    try {
      await credentialStore.saveLanSessionToken(lanToken)
      setConnectionMessage('LAN token saved to secure device storage.')
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to save LAN token')
    }
  }

  async function connectLanGateway() {
    try {
      const connection = parseMobileConnection(backendAddress, 'lan', connectionOptions)
      const token = await credentialStore.readLanSessionToken()
      if (!token) {
        throw new Error('Save a LAN token to secure device storage before connecting')
      }
      const connectedGateway = await connectGateway({ ...connection, ...connectionOptions, token })
      setGateway(connectedGateway)
      setRest(createRestClient({ ...connection, ...connectionOptions, token }))
      setConnectionMessage('LAN gateway connected.')
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to connect to LAN gateway')
    }
  }

  function resetGatewayState(message: string) {
    activeSessionRef.current = { runtimeSessionId: null, storedSessionId: null }
    setGateway(null)
    setRest(null)
    setSessions([])
    setSessionId(null)
    setActiveStoredSessionId(null)
    setMessages([])
    setDraft('')
    setPendingFiles([])
    setApproval(null)
    setToolActivities([])
    setConnectionMessage(message)
  }

  function disconnectGateway() {
    gateway?.close()
    resetGatewayState('Gateway disconnected.')
  }

  useEffect(() => {
    if (!gateway?.onState) {
      return
    }
    return gateway.onState(state => {
      if (state === 'closed' || state === 'error') {
        resetGatewayState('Gateway connection lost.')
      }
    })
  }, [gateway])

  async function refreshSessions() {
    if (!gateway || !rest) {
      return
    }
    try {
      setSessions(await createMobileSessionClient(gateway, rest).list())
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to load sessions')
    }
  }

  async function openStoredSession(storedSessionId: string) {
    if (!gateway || !rest) {
      return
    }
    try {
      const session = await createMobileSessionClient(gateway, rest).resume(storedSessionId)
      activeSessionRef.current = { runtimeSessionId: session.runtimeSessionId, storedSessionId: session.storedSessionId }
      setSessionId(session.runtimeSessionId)
      setActiveStoredSessionId(session.storedSessionId)
      setMessages(session.messages)
      setConnectionMessage(`Session ${session.storedSessionId} resumed.`)
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to resume session')
    }
  }

  async function startNewSession() {
    if (!gateway) {
      return
    }
    try {
      const session = await createMobileSessionClient(gateway).create('New mobile chat')
      setSessionId(session.runtimeSessionId)
      setMessages([])
      const storedSessionId = session.storedSessionId
      activeSessionRef.current = { runtimeSessionId: session.runtimeSessionId, storedSessionId: storedSessionId ?? null }
      setActiveStoredSessionId(storedSessionId ?? null)
      if (storedSessionId) {
        setSessions(current => current.some(item => item.id === storedSessionId)
          ? current
          : [{ id: storedSessionId, preview: null, title: 'New mobile chat' }, ...current])
      }
      setConnectionMessage(`Session ${session.runtimeSessionId} created.`)
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to create session')
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!gateway || !sessionId) {
      return
    }
    const text = sanitizeComposerInput(draft).trim()
    if (!text && pendingFiles.length === 0) {
      return
    }
    try {
      const attachments: MobileFileAttachment[] = await Promise.all(pendingFiles.map(async file => ({ dataUrl: await toDataUrl(file), name: file.name })))
      await createMobileAttachmentClient(gateway).submit(sessionId, text, attachments)
      setMessages(current => [...current, { id: `mobile-user-${Date.now()}`, parts: [textPart(text)], role: 'user' }])
      setDraft('')
      setPendingFiles([])
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to send message')
    }
  }

  useEffect(() => {
    setToolActivities([])
    if (!gateway || !sessionId) {
      return
    }
    return createMobileToolActivityClient(gateway).onActivity(sessionId, activity => {
      setToolActivities(current => [...current.filter(item => item.id !== activity.id), activity].slice(-3))
    })
  }, [gateway, sessionId])

  useEffect(() => {
    if (!gateway || !sessionId) {
      return
    }
    return createMobileApprovalClient(gateway).onRequest(sessionId, setApproval)
  }, [gateway, sessionId])

  async function respondToApproval(choice: 'deny' | 'once') {
    if (!gateway || !sessionId || !approval) {
      return
    }
    try {
      await createMobileApprovalClient(gateway).respond(sessionId, approval.requestId, choice)
      setApproval(null)
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to answer approval')
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--ui-bg-primary)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[var(--ui-text-primary)]">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-3xl flex-col">
        <header className="flex items-center gap-3 border-b border-(--ui-stroke-tertiary) pb-5">
          <BrandMark className="size-11 rounded-xl" />
          <div>
            <h1 className="font-['Collapse'] text-2xl font-bold tracking-tight">Hermes</h1>
            <p className="text-sm text-[var(--ui-text-secondary)]">Your remote workspace</p>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12" aria-labelledby="welcome-title">
          <p className="mb-3 font-mono text-xs tracking-[0.18em] text-[var(--ui-text-tertiary)]">MOBILE CLIENT · PREVIEW</p>
          <h2 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl" id="welcome-title">
            Ready when your workspace is.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ui-text-secondary)]">
            This first build keeps the Hermes experience on your mobile device while your agent stays on another computer.
          </p>
          {emulatorLoopbackEnabled && <p className="mt-4 w-fit rounded-lg border border-amber-500/50 px-3 py-2 font-mono text-xs text-amber-700 dark:text-amber-300">
            EMULATOR-ONLY LOOPBACK TUNNEL · Not valid for physical LAN devices.
          </p>}
          <div className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--ui-bg-quaternary)] px-3 py-2 text-sm text-[var(--ui-text-secondary)]">
            <span aria-hidden="true" className={`size-2 rounded-full ${gateway ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {gateway ? 'LAN gateway connected.' : 'Backend not connected'}
          </div>
        </section>

        <form className="border-t border-(--ui-stroke-tertiary) pt-4" onSubmit={validateConnection}>
          <div className="grid gap-3 rounded-2xl bg-[var(--ui-bg-quaternary)] p-4">
            <label className="grid gap-1 text-sm">
              <span>Connection mode</span>
              <select aria-label="Connection mode" className="rounded-lg bg-[var(--ui-bg-primary)] p-2" onChange={event => {
                const nextMode = event.target.value as MobileConnectionMode
                setMode(nextMode)
                setConnectionMessage('')
              }} value={mode}>
                <option value="secure">Secure HTTPS/WSS</option>
                <option value="lan">LAN HTTP/WS (insecure)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Backend address</span>
              <input aria-label="Backend address" className="rounded-lg bg-[var(--ui-bg-primary)] p-2" onChange={event => setBackendAddress(event.target.value)} placeholder={mode === 'lan' ? 'http://192.168.1.10:9119' : 'https://hermes.example.com'} value={backendAddress} />
            </label>
            {mode === 'lan' && <>
              <label className="grid gap-1 text-sm">
                <span>LAN session token</span>
                <input aria-label="LAN session token" autoComplete="off" className="rounded-lg bg-[var(--ui-bg-primary)] p-2" onChange={event => setLanToken(event.target.value)} type="password" value={lanToken} />
              </label>
              <label className="flex gap-2 text-sm text-[var(--ui-text-secondary)]">
                <input aria-label="I understand this LAN connection uses unencrypted HTTP and WS" checked={lanRiskConfirmed} onChange={event => setLanRiskConfirmed(event.target.checked)} type="checkbox" />
                I understand this LAN connection uses unencrypted HTTP and WS
              </label>
            </>}
            <button className="w-fit rounded-xl bg-[var(--ui-text-primary)] px-4 py-2 text-sm font-medium text-[var(--ui-bg-primary)] disabled:opacity-40" disabled={mode === 'lan' && (!lanRiskConfirmed || !lanToken)} type="submit">
              Validate connection
            </button>
            {mode === 'lan' && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={!lanRiskConfirmed || !lanToken} onClick={() => void saveLanToken()} type="button">
              Save LAN token
            </button>}
            {mode === 'lan' && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={Boolean(gateway) || !lanRiskConfirmed || !lanToken} onClick={() => void connectLanGateway()} type="button">
              Connect LAN gateway
            </button>}
            {gateway && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium" onClick={disconnectGateway} type="button">
              Disconnect gateway
            </button>}
            {gateway && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium" onClick={() => void refreshSessions()} type="button">
              Refresh sessions
            </button>}
            {gateway && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium" onClick={() => void startNewSession()} type="button">
              Start new session
            </button>}
            {connectionMessage && <p role="status" className="text-sm text-[var(--ui-text-secondary)]">{connectionMessage}</p>}
          </div>
        </form>

        {sessions.length > 0 && <section aria-label="Saved sessions" className="flex flex-col gap-2 py-4">
          {sessions.map(session => <button aria-label={`Open ${session.title || 'Untitled session'}`} className="rounded-xl border border-(--ui-stroke-tertiary) p-3 text-left" key={session.id} onClick={() => void openStoredSession(session.id)} type="button">
            <p className="font-medium">{session.title || 'Untitled session'}</p>
            {session.preview && <p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{session.preview}</p>}
          </button>)}
        </section>}

        {approval && <section aria-label="Approval request" className="rounded-xl border border-amber-500/50 p-3">
          <p className="font-medium">Approval required</p>
          {approval.description && <p className="mt-1 text-sm">{approval.description}</p>}
          {approval.command && <pre className="mt-2 overflow-x-auto text-sm">{approval.command}</pre>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => void respondToApproval('once')} type="button">Allow once</button>
            <button onClick={() => void respondToApproval('deny')} type="button">Deny</button>
          </div>
        </section>}

        {toolActivities.length > 0 && <section aria-label="Tool activity" className="flex flex-col gap-2 py-4">
          <p className="font-mono text-xs tracking-[0.14em] text-[var(--ui-text-tertiary)]">TOOL ACTIVITY</p>
          {toolActivities.map(activity => <p className="rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2 text-sm" key={activity.id}>{activity.name} · {activity.status}</p>)}
        </section>}

        {messages.length > 0 && <section aria-label="Conversation" className="flex flex-1 flex-col gap-3 py-6">
          {messages.map(message => <article className={message.role === 'user' ? 'self-end rounded-2xl bg-[var(--ui-bg-quaternary)] p-3' : 'self-start rounded-2xl border border-(--ui-stroke-tertiary) p-3'} key={message.id}>
            {chatMessageText(message)}
          </article>)}
        </section>}

        <form className="border-t border-(--ui-stroke-tertiary) pt-4" onSubmit={submitMessage}>
          {pendingFiles.length > 0 && <div aria-label="Pending attachments" className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((file, index) => <button className="rounded-lg border border-(--ui-stroke-tertiary) px-2 py-1 text-sm" key={`${file.name}-${index}`} onClick={() => setPendingFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove {file.name}</button>)}
          </div>}
          <input aria-label="Attach file" className="sr-only" disabled={!sessionId} onChange={event => setPendingFiles(current => [...current, ...Array.from(event.target.files ?? [])])} type="file" />
          <label className="sr-only" htmlFor="ipad-message">Message composer</label>
          <div className="flex items-end gap-3 rounded-2xl bg-[var(--ui-bg-quaternary)] p-3">
            <textarea aria-label="Message composer" className="min-h-14 flex-1 resize-none bg-transparent px-1 py-2 text-base outline-none placeholder:text-[var(--ui-text-tertiary)]" disabled={!sessionId} id="ipad-message" onChange={event => setDraft(event.target.value)} placeholder={sessionId ? 'Message Hermes' : 'Create a session to start a conversation'} rows={2} value={draft} />
            <button aria-label="Send message" className="shrink-0 rounded-xl bg-[var(--ui-text-primary)] px-4 py-2 text-sm font-medium text-[var(--ui-bg-primary)] disabled:opacity-40" disabled={!sessionId || (!draft.trim() && pendingFiles.length === 0)} type="submit">Send</button>
          </div>
        </form>
      </div>
    </main>
  )
}
