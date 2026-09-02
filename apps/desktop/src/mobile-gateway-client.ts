import { JsonRpcGatewayClient } from '@hermes/shared'

import { openMobileGatewaySocket, type MobileGatewaySocketConfig, type OpenSocket } from './mobile-gateway-transport'
import { parseMobileConnection, toWebSocketUrl } from './mobile-connection'

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
