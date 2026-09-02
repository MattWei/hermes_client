export type MobileConnectionMode = 'secure' | 'lan'

export interface MobileConnection {
  baseUrl: string
  mode: MobileConnectionMode
}

function isRfc1918Ipv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number)

  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

export interface MobileConnectionOptions {
  allowEmulatorLoopback?: boolean
}

export function parseMobileConnection(
  rawUrl: string,
  mode: MobileConnectionMode,
  options: MobileConnectionOptions = {}
): MobileConnection {
  let parsed: URL

  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('Enter a valid backend URL')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Backend URLs cannot include credentials')
  }

  if (mode === 'secure') {
    if (parsed.protocol !== 'https:') {
      throw new Error('Secure connections require HTTPS')
    }
  } else {
    if (parsed.protocol !== 'http:') {
      throw new Error('LAN connections require HTTP')
    }

    const emulatorLoopback = options.allowEmulatorLoopback && parsed.hostname === '127.0.0.1'

    if (!isRfc1918Ipv4(parsed.hostname) && !emulatorLoopback) {
      throw new Error('LAN connections require an RFC1918 IPv4 address')
    }
  }

  return { baseUrl: parsed.toString().replace(/\/$/, ''), mode }
}

export function toWebSocketUrl(
  baseUrl: string,
  mode: MobileConnectionMode,
  options: MobileConnectionOptions = {}
): string {
  const connection = parseMobileConnection(baseUrl, mode, options)
  const parsed = new URL(connection.baseUrl)
  parsed.protocol = mode === 'secure' ? 'wss:' : 'ws:'
  parsed.pathname = '/api/ws'
  parsed.search = ''
  parsed.hash = ''

  return parsed.toString()
}
