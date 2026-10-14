import { useEffect, useRef, useState, type FormEvent } from 'react'

import { createMobileApprovalClient, type MobileApprovalRequest } from './mobile-approval-client'
import { createMobileAttachmentClient, type MobileFileAttachment } from './mobile-attachment-client'
import { mobileCredentialStore } from './capacitor-mobile-credential-store'
import { connectMobileGateway } from './mobile-gateway-client'
import { assistantTextPart, appendAssistantTextPart, mergeFinalAssistantText, textPart, type ChatMessage } from './lib/chat-messages'
import { sanitizeComposerInput } from './lib/composer-input-sanitize'
import type { MobileCredentialStore } from './mobile-credential-store'
import { createMobilePromptClient, type MobilePromptGateway } from './mobile-prompt-client'
import { createMobileGatewayRestClient, type MobileGatewayRestClient, type MobileGatewayRestConfig } from './mobile-gateway-rest'
import { createMobileRemoteLoginClient } from './mobile-remote-login'
import { createMobileSessionClient, loadMobileSessionHistory, type MobileGatewayRequest, type MobileSessionListItem, type MobileSessionRest } from './mobile-session-client'
import { createMobileProfileClient, type MobileProfileSummary } from './mobile-profile-client'
import { mergePinsFromRows, readCachedPins, writeCachedPins } from './mobile-session-pins'
import { createMobileToolActivityClient, type MobileToolActivity } from './mobile-tool-activity-client'
import type { MobileGatewaySocketConfig } from './mobile-gateway-transport'
import { parseMobileConnection, type MobileConnectionMode } from './mobile-connection'
import { Codicon } from './components/ui/codicon'
import { IpadSessionDetail } from './ipad-session-detail'
import { IpadShell } from './ipad-shell'

interface IpadHomeProps {
  connectGateway?: (config: MobileGatewaySocketConfig) => Promise<MobileGatewayRequest & MobilePromptGateway & { close(): void }>
  createRestClient?: (config: MobileGatewayRestConfig) => MobileGatewayRestClient
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
  const [view, setView] = useState<'list' | 'session'>('list')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [remoteUsername, setRemoteUsername] = useState('')
  const [remotePassword, setRemotePassword] = useState('')
  const [remoteSigningIn, setRemoteSigningIn] = useState(false)
  const [remotePasswordVisible, setRemotePasswordVisible] = useState(false)
  const [validating, setValidating] = useState(false)
  const [profiles, setProfiles] = useState<MobileProfileSummary[]>([])
  const [activeProfile, setActiveProfile] = useState('')
  const [autoLogin, setAutoLogin] = useState(false)
  // Guards the mount pass: auto-login must run once, not on every re-render.
  const autoLoginAttempted = useRef(false)

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

  /**
   * Probe the endpoint for real.
   *
   * This used to only parse the address and then report success, so "validated" meant nothing more
   * than "the URL is well-formed" while reading like a reachability check — a false positive that
   * sent a person looking for the fault in the wrong place. It now contacts the gateway and names
   * the failure it actually hit: unreachable, wrong port, not a Hermes gateway, or a rejected token.
   */
  async function validateConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidating(true)
    try {
      const connection = parseMobileConnection(backendAddress, mode, connectionOptions)
      const probe = createRestClient(
        mode === 'lan'
          ? { ...connection, ...connectionOptions, token: lanToken }
          : { ...connection, ...connectionOptions }
      )

      const status = await probe.get('/api/status')
      if (!status.ok) {
        throw new Error(`Gateway replied HTTP ${status.status}. Check the address and port.`)
      }
      const payload = await status.json() as { version?: unknown }
      if (typeof payload?.version !== 'string') {
        throw new Error('Reached that address, but it is not a Hermes gateway')
      }

      if (mode === 'lan') {
        // /api/status is public, so on its own it proves reachability only; the token needs its
        // own check or a wrong token would still report a healthy endpoint.
        const authorized = await probe.get('/api/sessions?limit=1')
        if (authorized.status === 401 || authorized.status === 403) {
          throw new Error('The gateway is reachable, but it rejected the LAN token')
        }
        if (!authorized.ok) {
          throw new Error(`The gateway answered HTTP ${authorized.status} for an authorized request`)
        }
        setConnectionMessage(`LAN gateway reachable (Hermes ${payload.version}) and the token was accepted.`)
      } else {
        setConnectionMessage(`Remote gateway reachable (Hermes ${payload.version}). Sign in to connect.`)
      }
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to reach the backend')
    } finally {
      setValidating(false)
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
      const restClient = createRestClient({ ...connection, ...connectionOptions, token })
      setGateway(connectedGateway)
      setRest(restClient)
      setView('list')
      setConnectionMessage('LAN gateway connected.')
      // Load the list as soon as the gateway is up. A failure here is not a
      // connection failure, so it must not overwrite the connected status.
      void loadConnectedSurface(connectedGateway, restClient)
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to connect to LAN gateway')
    }
  }

  /**
   * Sign in to a remote gateway and connect.
   *
   * The credential never lands in our own storage: the gateway sets a session cookie and the
   * native HTTP layer keeps it, so the password stays in component state and the cookie jar is
   * the only thing persisted. The ticket is minted per attempt because it is single-use.
   */
  async function connectRemoteGateway(pending?: { baseUrl: string; password: string; username: string }) {
    // The launch pass supplies the address too: it has just called setBackendAddress, and reading
    // the state here would still see the previous (empty) value, which fails address parsing.
    const username = pending?.username ?? remoteUsername
    const password = pending?.password ?? remotePassword
    const address = pending?.baseUrl ?? backendAddress
    setRemoteSigningIn(true)
    try {
      const connection = parseMobileConnection(address, 'secure', connectionOptions)
      const restClient = createRestClient({ ...connection, ...connectionOptions })
      const login = createMobileRemoteLoginClient(restClient)

      const providers = await login.listPasswordProviders()
      const provider = providers[0]
      if (!provider) {
        throw new Error('This gateway does not offer username and password sign-in')
      }

      await login.signIn(provider.name, username, password)
      const ticket = await login.mintWsTicket()
      const connectedGateway = await connectGateway({ ...connection, ...connectionOptions, ticket })

      // Only a person-initiated sign-in changes the stored preference. The auto-login pass must
      // not, or an unchecked box would be silently re-armed by a successful unattended launch.
      if (!pending) {
        if (autoLogin) {
          await credentialStore.saveAutoLogin({ baseUrl: connection.baseUrl, password, username })
        } else {
          await credentialStore.clearAutoLogin()
        }
      }

      setGateway(connectedGateway)
      setRest(restClient)
      setView('list')
      setConnectionMessage('Remote gateway connected.')
      // A list-load failure is not a connection failure, so it must not overwrite the
      // connected status.
      void loadConnectedSurface(connectedGateway, restClient)
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to connect to the remote gateway')
    } finally {
      setRemoteSigningIn(false)
    }
  }

  /**
   * Pull everything the connected surface needs, tolerating failure: a list or profile read that
   * fails is not a connection failure, so it must not overwrite the connected status.
   */
  function loadConnectedSurface(connectedGateway: NonNullable<typeof gateway>, restClient: MobileSessionRest, profile?: string) {
    void createMobileProfileClient(restClient).list()
      .then(list => {
        setProfiles(list)
        // With no choice made yet, the gateway's own default is the honest selection — an empty
        // value would match no option once the real profiles are known.
        if (!profile) {
          const fallback = list.find(entry => entry.isDefault)?.name ?? ''
          if (fallback) {
            setActiveProfile(fallback)
            void createMobileSessionClient(connectedGateway, restClient).list(fallback)
              .then(rows => setSessions(rememberPins(fallback, rows)))
              .catch(() => {})
            return
          }
        }
        void createMobileSessionClient(connectedGateway, restClient).list(profile)
          .then(rows => setSessions(rememberPins(profile ?? '', rows)))
          .catch(() => {})
      })
      .catch(() => {
        // Profile discovery failed; the session list is still worth loading without one.
        void createMobileSessionClient(connectedGateway, restClient).list(profile)
          .then(rows => setSessions(rememberPins(profile ?? '', rows)))
          .catch(() => {})
      })
  }

  /**
   * Selecting a profile re-homes the session list. Sessions live in per-profile databases, so the
   * list must be re-read rather than filtered locally, and the current session no longer belongs
   * to the surface being shown.
   */
  function selectProfile(profile: string) {
    setActiveProfile(profile)
    setSessions([])
    setSessionId(null)
    setActiveStoredSessionId(null)
    setMessages([])
    setView('list')
    if (gateway && rest) {
      loadConnectedSurface(gateway, rest, profile || undefined)
    }
  }

  /**
   * Deleting the session the user is reading must also clear it from the surface — the server
   * refuses to delete a live session, so a currently-open one is closed first by dropping the view
   * back to the list.
   */
  async function deleteStoredSession(storedSessionId: string) {
    if (!gateway || !rest) {
      return
    }
    try {
      await createMobileSessionClient(gateway, rest).remove(storedSessionId, activeProfile || undefined)
      if (activeStoredSessionId === storedSessionId) {
        activeSessionRef.current = { runtimeSessionId: null, storedSessionId: null }
        setSessionId(null)
        setActiveStoredSessionId(null)
        setMessages([])
        setView('list')
      }
      await refreshSessions()
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to delete the session.')
    }
  }

  /**
   * Fold the server's authoritative pins into the local cache for the rows in this page. The rows
   * themselves are returned untouched: the server row wins, and the cache is rewritten from it so a
   * relaunch paints the same thing before the first list arrives.
   */
  function rememberPins(profile: string, rows: MobileSessionListItem[]): MobileSessionListItem[] {
    mergePinsFromRows(profile, rows)
    return rows
  }

  /**
   * Pin/unpin paints immediately: the row moves as the finger lifts, and the request follows. The
   * cache is written in the same breath so a relaunch shows the same thing, and a failed write
   * rolls both back — the server remains the authority either way.
   */
  async function setSessionPinned(storedSessionId: string, pinned: boolean) {
    if (!gateway || !rest) {
      return
    }
    const profile = activeProfile || ''
    const previous = sessions
    const nextRows = sessions.map(row => row.id === storedSessionId ? { ...row, pinned } : row)
    const nextCache = readCachedPins(profile)
    if (pinned) {
      nextCache.add(storedSessionId)
    } else {
      nextCache.delete(storedSessionId)
    }

    setSessions(nextRows)
    writeCachedPins(profile, nextCache)

    try {
      await createMobileSessionClient(gateway, rest).setPinned(storedSessionId, pinned, activeProfile || undefined)
      await refreshSessions()
    } catch (error) {
      setSessions(previous)
      writeCachedPins(profile, mergePinsFromRows(profile, previous))
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to update the pin.')
    }
  }

  async function renameStoredSession(storedSessionId: string, title: string) {
    if (!gateway || !rest) {
      return
    }
    try {
      await createMobileSessionClient(gateway, rest).rename(storedSessionId, title, activeProfile || undefined)
      await refreshSessions()
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to rename the session.')
    }
  }

  function resetGatewayState(message: string) {
    activeSessionRef.current = { runtimeSessionId: null, storedSessionId: null }
    setView('list')
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
    if (autoLoginAttempted.current) {
      return
    }
    autoLoginAttempted.current = true
    void (async () => {
      const stored = await credentialStore.readAutoLogin()
      if (!stored) {
        return
      }
      setMode('secure')
      setBackendAddress(stored.baseUrl)
      setRemoteUsername(stored.username)
      setRemotePassword(stored.password)
      setAutoLogin(true)
      await connectRemoteGateway(stored)
    })()
    // Mount-only: this is the auto-login pass, not a reaction to a state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setSessions(rememberPins(activeProfile, await createMobileSessionClient(gateway, rest).list(activeProfile || undefined)))
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to load sessions')
    }
  }

  async function openStoredSession(storedSessionId: string) {
    if (!gateway || !rest) {
      return
    }
    // Enter the detail view immediately so the tap has a visible effect; the
    // transcript arrives while the resume request is in flight.
    setView('session')
    setSessionLoading(true)
    try {
      const session = await createMobileSessionClient(gateway, rest).resume(storedSessionId, activeProfile || undefined)
      activeSessionRef.current = { runtimeSessionId: session.runtimeSessionId, storedSessionId: session.storedSessionId }
      setSessionId(session.runtimeSessionId)
      setActiveStoredSessionId(session.storedSessionId)
      setMessages(session.messages)
      setConnectionMessage(`Session ${session.storedSessionId} resumed.`)
    } catch (error) {
      setView('list')
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to resume session')
    } finally {
      setSessionLoading(false)
    }
  }

  async function startNewSession() {
    if (!gateway) {
      return
    }
    /**
     * An untouched session is reusable.
     *
     * The backend deliberately does NOT persist a row at create time — it writes one on the first
     * turn — so repeatedly pressing New mints runtime sessions that hold no history and leave no
     * database row behind. Minting another one to replace an equally empty one produces nothing the
     * user can see except a growing local list of identical "New mobile chat" rows, all of which
     * vanish on the next launch because the server never knew about them. Stay on the empty one.
     */
    // Untouched means no sent messages AND nothing composed: a typed draft or a staged attachment
    // is the user's work, and minting a new session would discard it.
    const untouched = sessionId != null && messages.length === 0
      && draft.trim() === '' && pendingFiles.length === 0
    if (untouched) {
      setView('session')
      return
    }
    setView('session')
    setSessionLoading(true)
    try {
      const session = await createMobileSessionClient(gateway).create(activeProfile || undefined)
      setSessionId(session.runtimeSessionId)
      setMessages([])
      const storedSessionId = session.storedSessionId
      activeSessionRef.current = { runtimeSessionId: session.runtimeSessionId, storedSessionId: storedSessionId ?? null }
      setActiveStoredSessionId(storedSessionId ?? null)
      // Deliberately NOT added to the list. The backend writes no row until the first turn, so a row
      // here would be a local fiction: it cannot survive a reload, and pressing New again after
      // visiting another session layers a second identical fiction on top. The list is refreshed
      // once the session is real — see submitMessage. The open session is already visible in the
      // inset header, so nothing is lost by waiting.
      setConnectionMessage(`Session ${session.runtimeSessionId} created.`)
    } catch (error) {
      setView('list')
      setConnectionMessage(error instanceof Error ? error.message : 'Unable to create session')
    } finally {
      setSessionLoading(false)
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
      // The first turn is what makes the backend persist this session, so this is the moment the
      // list can truthfully include it. Refresh rather than guess.
      void refreshSessions()
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

  // Title of the session shown in the inset; null while no session is open.
  const activeTitle = activeStoredSessionId
    ? sessions.find(session => session.id === activeStoredSessionId)?.title || 'Untitled session'
    : null

  // Connected: the desktop-shaped layout — collapsible session sidebar plus the open session.
  if (gateway) {
    return (
      <main className="h-dvh overflow-hidden bg-[var(--ui-bg-primary)] text-[color:var(--ui-text-primary)]">
        <IpadShell
        activeProfile={activeProfile}
        onSelectProfile={selectProfile}
        profiles={profiles}
          activeSessionId={activeStoredSessionId}
          activeTitle={activeTitle}
          connectionMessage={connectionMessage}
          onCreate={() => void startNewSession()}
        onDelete={storedSessionId => void deleteStoredSession(storedSessionId)}
          onDisconnect={disconnectGateway}
          onOpen={storedSessionId => void openStoredSession(storedSessionId)}
          onRefresh={() => void refreshSessions()}
        onRename={(storedSessionId, title) => void renameStoredSession(storedSessionId, title)}
        onSetPinned={(storedSessionId, pinned) => void setSessionPinned(storedSessionId, pinned)}
          sessions={sessions}
        >
          {view === 'session' && sessionLoading && <p className="py-10 text-sm text-[color:var(--ui-text-tertiary)]" role="status">Loading session…</p>}

          {view === 'session' && !sessionLoading && <IpadSessionDetail
            approval={approval}
            draft={draft}
            messages={messages}
            onDraftChange={setDraft}
            onFilesChange={setPendingFiles}
            onRespondToApproval={choice => void respondToApproval(choice)}
            onSubmit={submitMessage}
            pendingFiles={pendingFiles}
            sessionId={sessionId}
            toolActivities={toolActivities}
          />}

          {view !== 'session' && <p className="py-10 text-sm text-[color:var(--ui-text-tertiary)]">Select a session, or start a new one.</p>}
        </IpadShell>
      </main>
    )
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--ui-bg-primary)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[color:var(--ui-text-primary)]">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-3xl flex-col justify-center">
        {emulatorLoopbackEnabled && <p className="mt-6 w-fit rounded-lg border border-amber-500/50 px-3 py-2 font-mono text-xs text-amber-700 dark:text-amber-300">
          EMULATOR-ONLY LOOPBACK TUNNEL · Not valid for physical LAN devices.
        </p>}

        <h1 className="mb-8 text-center font-['Collapse'] text-3xl font-bold tracking-tight">Hermes</h1>

        <form className="pt-4" onSubmit={event => void validateConnection(event)}>
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
              <label className="flex gap-2 text-sm text-[color:var(--ui-text-secondary)]">
                <input aria-label="I understand this LAN connection uses unencrypted HTTP and WS" checked={lanRiskConfirmed} onChange={event => setLanRiskConfirmed(event.target.checked)} type="checkbox" />
                I understand this LAN connection uses unencrypted HTTP and WS
              </label>
            </>}
            <button className="w-fit rounded-xl bg-[var(--ui-text-primary)] px-5 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={validating || (mode === 'lan' && (!lanRiskConfirmed || !lanToken))} type="submit">
              {validating ? 'Checking...' : 'Validate'}
            </button>
            {mode === 'lan' && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={!lanRiskConfirmed || !lanToken} onClick={() => void saveLanToken()} type="button">
              Save LAN token
            </button>}
            {mode === 'lan' && <button className="w-fit rounded-xl border border-(--ui-stroke-tertiary) px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={Boolean(gateway) || !lanRiskConfirmed || !lanToken} onClick={() => void connectLanGateway()} type="button">
              Connect LAN gateway
            </button>}
            {mode === 'secure' && <>
              <label className="grid gap-1 text-sm">
                <span>Username</span>
                <input aria-label="Remote username" autoCapitalize="none" autoComplete="username" className="rounded-lg bg-[var(--ui-bg-primary)] p-2" onChange={event => setRemoteUsername(event.target.value)} value={remoteUsername} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Password</span>
                <span className="relative flex items-center">
                  <input aria-label="Remote password" autoComplete="current-password" className="w-full rounded-lg bg-[var(--ui-bg-primary)] p-2 pr-11" onChange={event => setRemotePassword(event.target.value)} type={remotePasswordVisible ? 'text' : 'password'} value={remotePassword} />
                  <button aria-label={remotePasswordVisible ? 'Hide password' : 'Show password'} aria-pressed={remotePasswordVisible} className="absolute right-1 rounded-md p-2 text-[color:var(--ui-text-tertiary)]" onClick={() => setRemotePasswordVisible(current => !current)} type="button">
                    <Codicon name={remotePasswordVisible ? 'eye-closed' : 'eye'} size="1rem" />
                  </button>
                </span>
              </label>
              <label className="flex gap-2 text-sm text-[color:var(--ui-text-secondary)]">
                <input aria-label="Sign in automatically next time" checked={autoLogin} onChange={event => setAutoLogin(event.target.checked)} type="checkbox" />
                Sign in automatically next time
              </label>
              <button className="w-fit rounded-xl bg-[var(--ui-text-primary)] px-5 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={Boolean(gateway) || remoteSigningIn || !remoteUsername || !remotePassword} onClick={() => void connectRemoteGateway()} type="button">
                {remoteSigningIn ? 'Signing in...' : 'Sign in'}
              </button>
            </>}
            {connectionMessage && <p role="status" className="text-sm text-[color:var(--ui-text-secondary)]">{connectionMessage}</p>}
          </div>
        </form>

      </div>
    </main>
  )
}
