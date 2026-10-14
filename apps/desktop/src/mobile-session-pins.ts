/**
 * Local, per-profile pin cache.
 *
 * The durable record is `sessions.pinned` in each profile's state.db — the pin is what keeps an
 * otherwise aged-out conversation reachable, and a pin made on another device has to be visible
 * here. This cache exists only so the sidebar can paint the user's pins immediately: at launch,
 * and on the tap that toggles one, without waiting for a round trip.
 *
 * The server therefore always wins: a list response overwrites the cache for the rows it carries.
 * The cache is a hint about the last known state, never an authority.
 *
 * Storage is keyed by profile because a session id is only unique inside one — the same id in two
 * profiles is two different conversations.
 */

const STORAGE_PREFIX = 'hermes.mobile.pinned.'

function storageKey(profile: string): string {
  // The launch profile has no name of its own; one shared bucket keeps the default case simple.
  return `${STORAGE_PREFIX}${profile || 'default'}`
}

export function readCachedPins(profile: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(profile))
    if (!raw) {
      return new Set()
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set()
  } catch {
    // A cold or unreadable store is not an error: it just means nothing to show yet.
    return new Set()
  }
}

export function writeCachedPins(profile: string, ids: Iterable<string>): void {
  try {
    window.localStorage.setItem(storageKey(profile), JSON.stringify([...ids]))
  } catch {
    // Quota or a private-mode store: the pin still reached the server, which is what matters.
  }
}

/** Fold a session row's durable flag into the cache, returning the updated set. */
export function mergePinsFromRows(
  profile: string,
  rows: readonly { id: string; pinned: boolean }[]
): Set<string> {
  const next = readCachedPins(profile)

  for (const row of rows) {
    if (row.pinned) {
      next.add(row.id)
    } else {
      next.delete(row.id)
    }
  }

  writeCachedPins(profile, next)
  return next
}
