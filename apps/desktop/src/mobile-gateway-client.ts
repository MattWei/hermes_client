import { JsonRpcGatewayClient } from '@hermes/shared'

import { parseMobileConnection, toWebSocketUrl } from './mobile-connection'
import { type MobileGatewaySocketConfig, openMobileGatewaySocket, type OpenSocket } from './mobile-gateway-transport'

export async function connectMobileGateway(
  config: MobileGatewaySocketConfig,
  openSocket?: OpenSocket
): Promise<JsonRpcGatewayClient> {
  const connection = parseMobileConnection(config.baseUrl, config.mode, config)

  const client = new JsonRpcGatewayClient({
    socketFactory: () => openMobileGatewaySocket(config, openSocket)
  })

  await client.connect(toWebSocketUrl(connection.baseUrl, connection.mode, config))

  return client
}
