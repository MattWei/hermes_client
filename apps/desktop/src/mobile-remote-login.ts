/**
 * Dashboard sign-in for a remote (HTTPS) gateway.
 *
 * Mirrors what Hermes Desktop does for a password provider, minus Electron: discover the
 * provider, POST the credentials so the gateway sets its session cookie, then exchange that
 * cookie for the short-lived ticket a WebSocket upgrade needs (a WebSocket cannot carry a
 * cookie or a custom header).
 *
 * Three facts shape this module:
 * - The session cookie is not ours to store. It is set by the gateway and attached by the
 *   native HTTP layer, so nothing here persists a credential — which is also why sign-in
 *   survives only as long as that cookie jar does.
 * - Tickets are single-use and short-lived, so one is minted per connection attempt and
 *   never cached.
 * - Failures are deliberately generic server-side (no username/provider oracle). Translate
 *   the status codes into actionable copy rather than echoing the body.
 */

export interface RemoteLoginRest {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown): Promise<Response>
}

export interface RemotePasswordProvider {
  displayName: string
  name: string
}

export interface MobileRemoteLoginClient {
  /** Providers that accept a username and password. Empty when the gateway is OAuth-only. */
  listPasswordProviders(): Promise<RemotePasswordProvider[]>
  /** Exchanges credentials for a session cookie. Resolves once that cookie is set. */
  signIn(provider: string, username: string, password: string): Promise<void>
  /** Mints a single-use WebSocket upgrade ticket. */
  mintWsTicket(): Promise<string>
}

interface ProviderPayload {
  display_name?: unknown
  name?: unknown
  supports_password?: unknown
}

export function createMobileRemoteLoginClient(rest: RemoteLoginRest): MobileRemoteLoginClient {
  return {
    async listPasswordProviders(): Promise<RemotePasswordProvider[]> {
      const response = await rest.get('/api/auth/providers')
      if (!response.ok) {
        throw new Error(`Unable to list sign-in providers (HTTP ${response.status})`)
      }
      const payload = await response.json() as { providers?: ProviderPayload[] }
      return (payload.providers ?? [])
        .filter(provider => typeof provider.name === 'string' && provider.supports_password === true)
        .map(provider => ({
          displayName: typeof provider.display_name === 'string' ? provider.display_name : String(provider.name),
          name: String(provider.name)
        }))
    },

    async signIn(provider: string, username: string, password: string): Promise<void> {
      const response = await rest.post('/auth/password-login', { password, provider, username })
      if (response.status === 401) {
        throw new Error('Invalid username or password')
      }
      if (response.status === 404) {
        throw new Error('This gateway does not offer username and password sign-in')
      }
      if (response.status === 429) {
        throw new Error('Too many sign-in attempts. Wait a moment and try again.')
      }
      if (response.status === 503) {
        throw new Error('The gateway could not reach its credential store. Try again shortly.')
      }
      if (!response.ok) {
        throw new Error(`Sign-in failed (HTTP ${response.status})`)
      }
    },

    async mintWsTicket(): Promise<string> {
      const response = await rest.post('/api/auth/ws-ticket')
      if (response.status === 401 || response.status === 403) {
        throw new Error('Your session expired. Sign in again.')
      }
      if (!response.ok) {
        throw new Error(`Unable to obtain a WebSocket ticket (HTTP ${response.status})`)
      }
      const payload = await response.json() as { ticket?: unknown }
      if (typeof payload.ticket !== 'string' || !payload.ticket) {
        throw new Error('The gateway returned no WebSocket ticket')
      }
      return payload.ticket
    }
  }
}
