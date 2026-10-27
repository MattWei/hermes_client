/**
 * Remember where the gateway was, so a reconnect does not need a password.
 *
 * The dashboard session cookie lives in the platform cookie store and outlives both a backgrounded app and
 * a reloaded WebView; the address is the only piece the cookie cannot supply. It is not a secret — the same
 * host is visible in the app's own UI — so it belongs in `localStorage` beside the last session, not in the
 * Keychain with the credentials.
 *
 * Only ever a hint: a stored address with a refused cookie simply falls through to the sign-in form.
 */

const STORAGE_KEY = 'hermes.mobile.last-connection'

export function readLastConnection(): null | string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function rememberLastConnection(baseUrl: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, baseUrl)
  } catch {
    // Storage being unavailable costs a password re-entry, not correctness.
  }
}

/** Signing out is the one action that stops a launch from reconnecting on its own. */
export function forgetLastConnection(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the cookie will be refused at the next launch anyway.
  }
}
