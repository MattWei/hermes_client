import { toChatMessages, type ChatMessage } from './lib/chat-messages'
import type { SessionMessage } from './types/hermes'

export interface MobileGatewayRequest {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
}

/**
 * The gateway refused the session cookie (401/403).
 *
 * The cookie is stateless, signed with a key resolved at startup (`dashboard.basic_auth.secret`, or
 * a random per-process key when unset — so a restart can invalidate it) and it lapses with the
 * 30-day refresh window. An app relaunch does not end it. Whenever it does end, every call fails
 * the same way, so naming the case lets the caller retry with stored credentials instead of
 * surfacing an error the user can do nothing with.
 */
export class MobileSessionAuthError extends Error {
  constructor(status: number) {
    super('Your session expired. Sign in again.')
    this.name = 'MobileSessionAuthError'
    this.status = status
  }

  readonly status: number
}

export interface MobileSessionRest {
  get(path: string): Promise<Response>
  patch(path: string, body?: unknown): Promise<Response>
  remove(path: string): Promise<Response>
}

export interface MobileSessionIdentity {
  runtimeSessionId: string
  storedSessionId?: string
}

export interface MobileSessionListItem {
  /** Durable on the server; a pinned row is also back-filled past the page limit. */
  pinned: boolean
  id: string
  preview: null | string
  title: null | string
  /** Seconds since the epoch: `last_active` falling back to `started_at`; null when the backend
   *  omits both. Drives the sidebar's date grouping. */
  updatedAt: number | null
}

interface SessionCreateResponse {
  session_id?: unknown
  stored_session_id?: unknown
}

interface SessionListResponse {
  sessions?: unknown
}

interface SessionResumeResponse {
  session_id?: unknown
  session_key?: unknown
}

interface SessionMessagesResponse {
  messages?: unknown
}

export interface MobileResumedSession {
  messages: ChatMessage[]
  runtimeSessionId: string
  storedSessionId: string
}

/**
 * Session rows live in per-profile databases server-side, so a list is only meaningful for a named
 * profile. Omitting it asks for the process's own store — right for loopback/LAN, wrong for a remote
 * client that has selected a profile.
 */
function mobileSessionListPath(profile?: string): string {
  const base = '/api/sessions?limit=40&offset=0&min_messages=1&archived=exclude&order=recent'
  return profile ? `${base}&profile=${encodeURIComponent(profile)}` : base
}

function readSessionMessages(body: unknown): ChatMessage[] {
  const history = body as SessionMessagesResponse
  if (!Array.isArray(history.messages)) {
    throw new Error('Hermes returned an invalid session history')
  }
  return toChatMessages(history.messages as SessionMessage[])
}

export async function loadMobileSessionHistory(rest: MobileSessionRest, storedSessionId: string, profile?: string): Promise<ChatMessage[]> {
  // Messages are read from a per-profile database: without the profile the server looks in its own
  // store, finds no such session id, and answers with an empty transcript.
  const profileQuery = profile ? `&profile=${encodeURIComponent(profile)}` : ''
  const historyResponse = await rest.get(
    `/api/sessions/${encodeURIComponent(storedSessionId)}/messages?limit=120&order=latest&include_compacted=true${profileQuery}`
  )
  return historyResponse.status === 404 ? [] : readSessionMessages(await historyResponse.json())
}

export function createMobileSessionClient(gateway: MobileGatewayRequest, rest?: MobileSessionRest) {
  return {
    async create(profile?: string): Promise<MobileSessionIdentity> {
      // No title, matching the desktop: the backend auto-names the session after its first complete
      // exchange, and until then the list falls back to the preview. A placeholder title we invent
      // here would be stored forever and suppress that fallback.
      // The profile does travel: the session binds to it at creation and keeps it for every later call.
      const response = await gateway.request('session.create', {
        cols: 80,
        ...(profile ? { profile } : {}),
        source: 'mobile'
      }) as SessionCreateResponse
      if (typeof response.session_id !== 'string' || !response.session_id) {
        throw new Error('Hermes did not return a runtime session id')
      }
      return {
        runtimeSessionId: response.session_id,
        ...(typeof response.stored_session_id === 'string' && response.stored_session_id
          ? { storedSessionId: response.stored_session_id }
          : {})
      }
    },
    async resume(storedSessionId: string, profile?: string): Promise<MobileResumedSession> {
      if (!rest) {
        throw new Error('Mobile session resume requires a REST client')
      }
      // Resolve the session inside its own profile; the server binds profile_home from here and
      // every later call on this session follows it.
      const response = await gateway.request('session.resume', {
        cols: 80,
        omit_messages: true,
        ...(profile ? { profile } : {}),
        session_id: storedSessionId
      }) as SessionResumeResponse
      if (typeof response.session_id !== 'string' || !response.session_id) {
        throw new Error('Hermes did not return a runtime session id')
      }
      const messages = await loadMobileSessionHistory(rest, storedSessionId, profile)
      return {
        messages,
        runtimeSessionId: response.session_id,
        storedSessionId: typeof response.session_key === 'string' && response.session_key
          ? response.session_key
          : storedSessionId
      }
    },
    /**
     * Delete a stored session. The server locates it in the named profile's database, refuses while
     * the session is live, and removes its transcripts alongside the row.
     */
    /**
     * Delete a stored session.
     *
     * REST rather than the WS `session.delete`: the WS method resolves its target through the
     * gateway's in-memory session table (keyed by RUNTIME id) and refuses anything still held there
     * with 4023 — which includes a session that was merely resumed. The REST route resolves the
     * stored id the list actually carries straight against the database and only guards a genuinely
     * in-flight write.
     */
    async remove(storedSessionId: string, profile?: string): Promise<void> {
      if (!rest) {
        throw new Error('Mobile session delete requires a REST client')
      }
      // Absent counts as success: the endpoint is idempotent, and a row can vanish between paint and tap.
      const query = profile ? `?profile=${encodeURIComponent(profile)}` : ''
      const response = await rest.remove(`/api/sessions/${encodeURIComponent(storedSessionId)}${query}`)
      if (!response.ok && response.status !== 404) {
        throw new Error(`Unable to delete the session (HTTP ${response.status})`)
      }
    },
    /**
     * Rename a stored session, by the same REST route the desktop uses. Sending a title is explicit
     * intent, so the server persists the row immediately; the list's min-messages filter keeps a
     * titled-but-empty row out of the sidebar until it has content.
     */
    async rename(storedSessionId: string, title: string, profile?: string): Promise<string> {
      if (!rest) {
        throw new Error('Mobile session rename requires a REST client')
      }
      const trimmed = title.trim()
      if (!trimmed) {
        throw new Error('A session needs a non-empty title')
      }
      const response = await rest.patch(`/api/sessions/${encodeURIComponent(storedSessionId)}`, {
        title: trimmed,
        ...(profile ? { profile } : {})
      })
      if (!response.ok) {
        throw new Error(`Unable to rename the session (HTTP ${response.status})`)
      }
      const payload = await response.json() as { title?: unknown }
      return typeof payload.title === 'string' ? payload.title : trimmed
    },
    /**
     * Pin or unpin a session. The durable record is the row's own `pinned` column, which the list
     * also reads back — the pin is what keeps an otherwise aged-out conversation reachable.
     */
    async setPinned(storedSessionId: string, pinned: boolean, profile?: string): Promise<void> {
      if (!rest) {
        throw new Error('Mobile session pin requires a REST client')
      }
      const response = await rest.patch(`/api/sessions/${encodeURIComponent(storedSessionId)}`, {
        pinned,
        ...(profile ? { profile } : {})
      })
      if (!response.ok) {
        throw new Error(`Unable to ${pinned ? 'pin' : 'unpin'} the session (HTTP ${response.status})`)
      }
    },
    async list(profile?: string): Promise<MobileSessionListItem[]> {
      if (!rest) {
        throw new Error('Mobile session list requires a REST client')
      }
      const response = await rest.get(mobileSessionListPath(profile))
      if (response.status === 401 || response.status === 403) {
        throw new MobileSessionAuthError(response.status)
      }
      if (!response.ok) {
        throw new Error(`Unable to list sessions (HTTP ${response.status})`)
      }
      const body = await response.json() as SessionListResponse
      if (!Array.isArray(body.sessions)) {
        throw new Error('Hermes returned an invalid session list')
      }
      return body.sessions.flatMap(item => {
        const session = item as { id?: unknown, last_active?: unknown, pinned?: unknown, preview?: unknown, started_at?: unknown, title?: unknown }
        if (typeof session.id !== 'string' || !session.id) {
          return []
        }
        const updatedAt = [session.last_active, session.started_at].find(value => typeof value === 'number' && Number.isFinite(value))
        return [{
          id: session.id,
          pinned: session.pinned === true || session.pinned === 1,
          preview: typeof session.preview === 'string' ? session.preview : null,
          title: typeof session.title === 'string' ? session.title : null,
          updatedAt: typeof updatedAt === 'number' ? updatedAt : null
        }]
      })
    }
  }
}
