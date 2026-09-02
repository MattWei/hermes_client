import { type ChatMessage, toChatMessages } from './lib/chat-messages'
import type { SessionMessage } from './types/hermes'

export interface MobileGatewayRequest {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
}

export interface MobileSessionRest {
  get(path: string): Promise<Response>
}

export interface MobileSessionIdentity {
  runtimeSessionId: string
  storedSessionId?: string
}

export interface MobileSessionListItem {
  id: string
  preview: null | string
  title: null | string
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

const MOBILE_SESSION_LIST_PATH = '/api/sessions?limit=40&offset=0&min_messages=0&archived=exclude&order=recent'

function readSessionMessages(body: unknown): ChatMessage[] {
  const history = body as SessionMessagesResponse

  if (!Array.isArray(history.messages)) {
    throw new Error('Hermes returned an invalid session history')
  }

  return toChatMessages(history.messages as SessionMessage[])
}

export async function loadMobileSessionHistory(
  rest: MobileSessionRest,
  storedSessionId: string
): Promise<ChatMessage[]> {
  const historyResponse = await rest.get(
    `/api/sessions/${encodeURIComponent(storedSessionId)}/messages?limit=120&order=latest&include_compacted=true`
  )

  return historyResponse.status === 404 ? [] : readSessionMessages(await historyResponse.json())
}

export function createMobileSessionClient(gateway: MobileGatewayRequest, rest?: MobileSessionRest) {
  return {
    async create(title: string): Promise<MobileSessionIdentity> {
      const response = (await gateway.request('session.create', {
        cols: 80,
        source: 'mobile',
        title
      })) as SessionCreateResponse

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
    async resume(storedSessionId: string): Promise<MobileResumedSession> {
      if (!rest) {
        throw new Error('Mobile session resume requires a REST client')
      }

      const response = (await gateway.request('session.resume', {
        cols: 80,
        omit_messages: true,
        session_id: storedSessionId
      })) as SessionResumeResponse

      if (typeof response.session_id !== 'string' || !response.session_id) {
        throw new Error('Hermes did not return a runtime session id')
      }

      const messages = await loadMobileSessionHistory(rest, storedSessionId)

      return {
        messages,
        runtimeSessionId: response.session_id,
        storedSessionId:
          typeof response.session_key === 'string' && response.session_key ? response.session_key : storedSessionId
      }
    },
    async list(): Promise<MobileSessionListItem[]> {
      if (!rest) {
        throw new Error('Mobile session list requires a REST client')
      }

      const response = await rest.get(MOBILE_SESSION_LIST_PATH)
      const body = (await response.json()) as SessionListResponse

      if (!Array.isArray(body.sessions)) {
        throw new Error('Hermes returned an invalid session list')
      }

      return body.sessions.flatMap(item => {
        const session = item as { id?: unknown; preview?: unknown; title?: unknown }

        if (typeof session.id !== 'string' || !session.id) {
          return []
        }

        return [
          {
            id: session.id,
            preview: typeof session.preview === 'string' ? session.preview : null,
            title: typeof session.title === 'string' ? session.title : null
          }
        ]
      })
    }
  }
}
