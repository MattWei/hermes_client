import { Capacitor, CapacitorHttp } from '@capacitor/core'

import { parseMobileConnection, type MobileConnectionMode } from './mobile-connection'

export interface MobileGatewayRestConfig {
  accessToken?: string
  allowEmulatorLoopback?: boolean
  baseUrl: string
  mode: MobileConnectionMode
  token?: string
}

interface NativeHttpResponse {
  data: unknown
  headers: Record<string, string>
  status: number
}

interface NativeHttpOptions {
  headers: Record<string, string>
  responseType: 'text'
  url: string
}

interface MobileGatewayRestRuntime {
  isNativePlatform(): boolean
  nativeHttp: {
    get(options: NativeHttpOptions): Promise<NativeHttpResponse>
    post(options: NativeHttpOptions & { data: unknown }): Promise<NativeHttpResponse>
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const capacitorRuntime: MobileGatewayRestRuntime = {
  isNativePlatform: () => Capacitor.isNativePlatform(),
  nativeHttp: CapacitorHttp
}

export function createMobileGatewayRestClient(
  config: MobileGatewayRestConfig,
  fetchFn: FetchLike = fetch,
  runtime: MobileGatewayRestRuntime = capacitorRuntime
) {
  const connection = parseMobileConnection(config.baseUrl, config.mode, config)
  const headers = connection.mode === 'lan'
    ? lanHeaders(config.token)
    : secureHeaders(config.accessToken)

  async function send(path: string, init: { body?: unknown; method: 'GET' | 'POST' }): Promise<Response> {
    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) {
      throw new Error('Mobile gateway REST paths must begin with /api/ or /auth/')
    }
    const requestHeaders = init.method === 'POST'
      ? { ...headers, 'Content-Type': 'application/json' }
      : headers
    const url = `${connection.baseUrl}${path}`

    if (!runtime.isNativePlatform()) {
      return fetchFn(url, {
        body: init.method === 'POST' ? JSON.stringify(init.body ?? {}) : undefined,
        headers: requestHeaders,
        method: init.method
      })
    }

    const options: NativeHttpOptions = { headers: requestHeaders, responseType: 'text', url }
    const response = init.method === 'POST'
      ? await runtime.nativeHttp.post({ ...options, data: init.body ?? {} })
      : await runtime.nativeHttp.get(options)
    return toResponse(response)
  }

  return {
    get(path: string): Promise<Response> {
      return send(path, { method: 'GET' })
    },
    post(path: string, body?: unknown): Promise<Response> {
      return send(path, { body, method: 'POST' })
    }
  }
}

/** The client's own shape — the single source of truth for its consumers. */
export type MobileGatewayRestClient = ReturnType<typeof createMobileGatewayRestClient>

function toResponse(response: NativeHttpResponse): Response {
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null)
  return new Response(body, { headers: response.headers, status: response.status })
}

function lanHeaders(token?: string): Record<string, string> {
  if (!token) {
    throw new Error('LAN connections require a session token')
  }
  return { 'X-Hermes-Session-Token': token }
}

function secureHeaders(accessToken?: string): Record<string, string> {
  // An absent token means the dashboard-login flow, where authentication rides the session
  // cookie set by POST /auth/password-login. Emitting an empty Authorization header would
  // make the request malformed instead of falling through to cookie auth.
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}
