import { parseMobileConnection, toWebSocketUrl, type MobileConnectionMode } from './mobile-connection'

export interface MobileGatewaySocketConfig {
  baseUrl: string
  mode: MobileConnectionMode
  allowEmulatorLoopback?: boolean
  ticket?: string
  token?: string
}

export type OpenSocket = (url: string) => WebSocket

export function openMobileGatewaySocket(
  config: MobileGatewaySocketConfig,
  openSocket: OpenSocket = url => new WebSocket(url)
): WebSocket {
  const connection = parseMobileConnection(config.baseUrl, config.mode, config)
  const wsUrl = new URL(toWebSocketUrl(connection.baseUrl, connection.mode, config))

  if (connection.mode === 'lan') {
    if (!config.token) {
      throw new Error('LAN connections require a session token')
    }
    wsUrl.searchParams.set('token', config.token)
  } else {
    if (!config.ticket) {
      throw new Error('Secure connections require a one-time ticket')
    }
    wsUrl.searchParams.set('ticket', config.ticket)
  }

  return openSocket(wsUrl.toString())
}
