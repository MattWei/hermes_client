import { Capacitor, CapacitorHttp } from '@capacitor/core'

import { type MobileConnectionMode, parseMobileConnection } from './mobile-connection'

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

interface MobileGatewayRestRuntime {
  isNativePlatform(): boolean
  nativeHttp: {
    get(options: { headers: Record<string, string>; responseType: 'text'; url: string }): Promise<NativeHttpResponse>
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

  const headers = connection.mode === 'lan' ? lanHeaders(config.token) : secureHeaders(config.accessToken)

  return {
    async get(path: string): Promise<Response> {
      if (!path.startsWith('/api/')) {
        throw new Error('Mobile gateway REST paths must begin with /api/')
      }

      const url = `${connection.baseUrl}${path}`

      if (!runtime.isNativePlatform()) {
        return fetchFn(url, { headers })
      }

      return toResponse(await runtime.nativeHttp.get({ url, headers, responseType: 'text' }))
    }
  }
}

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
  if (!accessToken) {
    throw new Error('Secure connections require an access token')
  }

  return { Authorization: `Bearer ${accessToken}` }
}
