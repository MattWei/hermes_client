/**
 * Remember which conversation was open, so a relaunch returns to it.
 *
 * Keyed by profile for the same reason the pin cache is: a session id is only unique inside one
 * profile, and switching profile is a re-home, not a scroll — the remembered row belongs to the
 * store it was read from.
 *
 * Only ever a hint. The id is resolved through the gateway on launch, so a session deleted
 * elsewhere, or one whose profile is no longer selected, simply fails to resume and the surface
 * stays on the list.
 *
 * Signing out deliberately does not clear it: that drops the connection, not the place. The next
 * launch reconnects and returns to the conversation the user was reading.
 */

const STORAGE_PREFIX = 'hermes.mobile.last-session.'

function storageKey(profile: string): string {
  return `${STORAGE_PREFIX}${profile || 'default'}`
}

export function readLastSession(profile: string): null | string {
  try {
    const id = window.localStorage.getItem(storageKey(profile))
    return id || null
  } catch {
    return null
  }
}

export function rememberLastSession(profile: string, storedSessionId: string): void {
  try {
    window.localStorage.setItem(storageKey(profile), storedSessionId)
  } catch {
    // Quota or a private-mode store: reopening lands on the list instead. Not worth failing over.
  }
}

export function forgetLastSession(profile: string): void {
  try {
    window.localStorage.removeItem(storageKey(profile))
  } catch {
    // Nothing to do; a stale id is harmless because resume resolves it before showing anything.
  }
}
