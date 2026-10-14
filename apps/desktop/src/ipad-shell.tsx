import { useMemo, useRef, useState, type ReactNode } from 'react'

import { SearchField } from './components/ui/search-field'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from './components/ui/sidebar'
import { useI18n } from './i18n'
import { normalize } from './lib/text'
import { calendarBucket, sessionBucketLabel } from './lib/time'
import type { MobileSessionListItem } from './mobile-session-client'
import type { MobileProfileSummary } from './mobile-profile-client'

interface IpadShellProps {
  activeProfile: string
  activeSessionId: string | null
  activeTitle: string | null
  children: ReactNode
  connectionMessage: string
  onCreate: () => void
  onDelete: (storedSessionId: string) => void
  onDisconnect: () => void
  onOpen: (storedSessionId: string) => void
  onRefresh: () => void
  onRename: (storedSessionId: string, title: string) => void
  onSelectProfile: (profile: string) => void
  profiles: MobileProfileSummary[]
  sessions: MobileSessionListItem[]
}

interface SessionGroup {
  items: MobileSessionListItem[]
  key: string
  label: string
}

/**
 * Desktop-shaped layout for the connected mobile client: a collapsible left sidebar built from
 * the same `components/ui/sidebar` primitives the desktop shell uses — searchable, date-grouped
 * session list plus the session actions — with the open session in the inset.
 */
/**
 * Mirrors the desktop sidebar's fallback chain (title -> preview -> placeholder): most sessions
 * never get an auto-title, and the preview is what actually identifies them to a person.
 */
function sessionLabel(session: MobileSessionListItem): string {
  return session.title?.trim() || session.preview?.trim() || 'Untitled session'
}

export function IpadShell({
  activeProfile, activeSessionId, activeTitle, children, connectionMessage, onCreate, onDelete, onDisconnect,
  onOpen, onRefresh, onRename, onSelectProfile, profiles, sessions
}: IpadShellProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  // Long-press opens a small action sheet for one row; rename swaps that row for an input rather
  // than opening a dialog, since WKWebView does not present window.prompt().
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ draft: string; id: string } | null>(null)
  // WKWebView does not deliver `contextmenu` for a long press on an ordinary element — it shows the
  // system callout or nothing at all — so the press is timed here instead of relying on that event.
  const pressTimer = useRef<number | null>(null)
  const pressHandled = useRef(false)

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function startPress(id: string) {
    cancelPress()
    pressHandled.current = false
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      pressHandled.current = true
      setMenuFor(current => current === id ? null : id)
    }, 450)
  }

  const groups = useMemo<SessionGroup[]>(() => {
    const needle = normalize(query)
    const matching = needle
      ? sessions.filter(session => [session.title, session.preview, session.id].some(value => normalize(value).includes(needle)))
      : sessions
    const byBucket = new Map<string, SessionGroup>()

    for (const session of matching) {
      const bucket = calendarBucket(session.updatedAt ?? 0)
      const group = byBucket.get(bucket.key)

      if (group) {
        group.items.push(session)
      } else {
        byBucket.set(bucket.key, { items: [session], key: bucket.key, label: sessionBucketLabel(bucket, t.sidebar.dateDivider) })
      }
    }

    return [...byBucket.values()]
  }, [sessions, query, t])

  return (
    <SidebarProvider className="h-svh min-h-0">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="pt-[max(1.5rem,env(safe-area-inset-top))]">
          {/* The inset header's trigger owns collapsing and expanding both, so the sidebar
              carries the title only. */}
          <div className="flex items-center gap-2 px-1 pb-1">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">Sessions</p>
            <SidebarMenuButton className="w-auto shrink-0 px-2" onClick={onDisconnect}>
              <span className="truncate">logout</span>
            </SidebarMenuButton>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onCreate}>
                <span className="truncate">Start new session</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onRefresh}>
                <span className="truncate">Refresh sessions</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="px-1 pb-1">
            <SearchField
              aria-label="Search sessions"
              onChange={setQuery}
              onClear={() => setQuery('')}
              placeholder={t.sidebar.searchPlaceholder}
              value={query}
            />
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.length === 0
            ? <p className="px-2 py-1.5 text-sm text-[color:var(--ui-text-tertiary)]">
              {query ? 'No matching sessions.' : 'No saved sessions yet.'}
            </p>
            : groups.map(group => (
              <SidebarGroup key={group.key}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map(session => (
                      <SidebarMenuItem className="relative" key={session.id}>
                        {renaming?.id === session.id
                          ? <form
                            className="px-1 py-0.5"
                            onSubmit={event => {
                              event.preventDefault()
                              const next = renaming.draft.trim()
                              setRenaming(null)
                              if (next && next !== sessionLabel(session)) {
                                onRename(session.id, next)
                              }
                            }}
                          >
                            <input
                              aria-label="New session title"
                              autoFocus
                              className="w-full rounded-md bg-[var(--ui-bg-primary)] px-2 py-1 text-sm outline-none"
                              onBlur={() => setRenaming(null)}
                              onChange={event => setRenaming({ draft: event.target.value, id: session.id })}
                              value={renaming.draft}
                            />
                          </form>
                          : <SidebarMenuButton
                            aria-label={`Open ${sessionLabel(session)}`}
                            className="[-webkit-touch-callout:none] select-none"
                            isActive={session.id === activeSessionId}
                            onClick={event => {
                              // A long press already acted; do not also open the session.
                              if (pressHandled.current) {
                                event.preventDefault()
                                pressHandled.current = false
                                return
                              }
                              setMenuFor(null)
                              onOpen(session.id)
                            }}
                            onContextMenu={event => event.preventDefault()}
                            onPointerCancel={cancelPress}
                            onPointerDown={event => {
                              // Mouse users get the context menu; touch needs the timer.
                              if (event.pointerType === 'mouse') {
                                return
                              }
                              startPress(session.id)
                            }}
                            onPointerLeave={cancelPress}
                            onPointerUp={cancelPress}
                          >
                            <span className="min-w-0 flex-1 truncate text-left">{sessionLabel(session)}</span>
                          </SidebarMenuButton>}
                        {menuFor === session.id && <div
                          className="absolute right-1 top-full z-50 flex flex-col rounded-lg border border-(--ui-stroke-tertiary) bg-[var(--ui-bg-primary)] py-1 shadow-lg"
                          role="menu"
                        >
                          <button
                            className="whitespace-nowrap px-4 py-1.5 text-left text-sm"
                            onClick={() => {
                              setMenuFor(null)
                              setRenaming({ draft: session.title ?? '', id: session.id })
                            }}
                            role="menuitem"
                            type="button"
                          >
                            Rename
                          </button>
                          <button
                            className="whitespace-nowrap px-4 py-1.5 text-left text-sm"
                            onClick={() => {
                              setMenuFor(null)
                              onDelete(session.id)
                            }}
                            role="menuitem"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
        </SidebarContent>

        <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {profiles.length > 1 && <div className="px-1 pb-1">
            <select
              aria-label="Profile"
              className="w-full rounded-md bg-[var(--ui-bg-primary)] px-2 py-1 text-xs"
              onChange={event => onSelectProfile(event.target.value)}
              value={activeProfile}
            >
              {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.displayName}</option>)}
            </select>
          </div>}
          {connectionMessage && <p className="px-2 pb-1 text-xs text-[color:var(--ui-text-tertiary)]">{connectionMessage}</p>}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <SidebarTrigger className="-ml-1" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {activeTitle || 'No session selected'}
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
