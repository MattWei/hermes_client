/**
 * The one thing the mobile footer says about the backend it is connected to.
 *
 * It answers exactly one question — is the backend I am talking to working? — because the connection is
 * already proven by the fact that this surface is on screen. Anything else the backend reports (a
 * messaging platform that failed to start, for instance) belongs to a different audience: it has no
 * bearing on this client, and repeating it here would be noise dressed as status.
 */

export interface MobileGatewayStatus {
  /** Empty when the backend has not said anything we can stand behind. */
  label: string
  tone: 'ok' | 'warn'
}

interface StatusPayload {
  gateway_running?: unknown
  gateway_state?: unknown
}

export function readGatewayStatus(payload: unknown): MobileGatewayStatus {
  if (!payload || typeof payload !== 'object') {
    return { label: '', tone: 'ok' }
  }
  const record = payload as StatusPayload

  if (record.gateway_running === false) {
    const state = String(record.gateway_state ?? '').trim()
    // "stopped" adds nothing to "Backend stopped"; any other state is worth quoting.
    return { label: state && state !== 'stopped' ? `Backend ${state}` : 'Backend stopped', tone: 'warn' }
  }

  // Only a positive answer earns "ready": a payload that never mentions the gateway is not evidence of
  // a healthy one, and an empty label leaves the footer showing the host alone.
  return record.gateway_running === true
    ? { label: 'Backend ready', tone: 'ok' }
    : { label: '', tone: 'ok' }
}

/** The host a person recognises: no scheme, no path, no trailing slash. */
export function gatewayHostLabel(address: string): string {
  const raw = (address || '').trim()
  if (!raw) {
    return ''
  }
  try {
    return new URL(raw).host
  } catch {
    return raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/.*$/, '')
  }
}
