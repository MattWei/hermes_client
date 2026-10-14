/**
 * Profile discovery for a remote gateway.
 *
 * A profile is a separate HERMES_HOME: its own sessions database, model, skills and credentials.
 * Selecting one changes which store the session list reads from and which profile a newly created
 * session binds to — it is a request-level choice, not a change to the server's global state, so
 * other clients are unaffected.
 *
 * Only discovery lives here. The selection itself travels as a parameter on the two calls that
 * need it (the session list and session.create), because a session binds to its profile at
 * creation and keeps it thereafter.
 */

export interface MobileProfileRest {
  get(path: string): Promise<Response>
}

export interface MobileProfileSummary {
  displayName: string
  isDefault: boolean
  model: string | null
  name: string
  provider: string | null
}

interface ProfilePayload {
  display_name?: unknown
  is_default?: unknown
  model?: unknown
  name?: unknown
  provider?: unknown
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export function createMobileProfileClient(rest: MobileProfileRest) {
  return {
    async list(): Promise<MobileProfileSummary[]> {
      const response = await rest.get('/api/profiles')
      if (response.status === 401 || response.status === 403) {
        throw new Error('Your session expired. Sign in again.')
      }
      if (!response.ok) {
        throw new Error(`Unable to list profiles (HTTP ${response.status})`)
      }
      const payload = await response.json() as { profiles?: ProfilePayload[] }
      return (payload.profiles ?? [])
        .filter(profile => typeof profile.name === 'string' && profile.name)
        .map(profile => ({
          // The gateway leaves display_name empty for most profiles; the name is the real label.
          displayName: asString(profile.display_name) ?? String(profile.name),
          isDefault: profile.is_default === true,
          model: asString(profile.model),
          name: String(profile.name),
          provider: asString(profile.provider)
        }))
    }
  }
}
