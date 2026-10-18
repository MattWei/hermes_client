import {
  useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode
} from 'react'

import { Codicon } from './components/ui/codicon'
import { MobileSelect } from './mobile-select'
import { clampSidebarWidth } from './mobile-sidebar-width'
import { SearchField } from './components/ui/search-field'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar
} from './components/ui/sidebar'
import { useI18n } from './i18n'
import { normalize } from './lib/text'
import { calendarBucket, sessionBucketLabel } from './lib/time'
import type { MobileGatewayStatus } from './mobile-gateway-status'
import type { MobileSessionListItem } from './mobile-session-client'
import type { MobileProfileSummary } from './mobile-profile-client'

interface IpadShellProps {
  activeProfile: string
  activeSessionId: string | null
  activeTitle: string | null
  children: ReactNode
  connectionMessage: string
  /** Host of the gateway this surface is talking to, e.g. `api.wei-agent.com`. */
  gatewayHost: string
  /** Backend health in one phrase; empty until the first status read lands. */
  gatewayStatus: MobileGatewayStatus
  onCreate: () => void
  onDelete: (storedSessionId: string) => void
  onDisconnect: () => void
  onOpen: (storedSessionId: string) => void
  onRefresh: () => void
  onRename: (storedSessionId: string, title: string) => void
  onSetPinned: (storedSessionId: string, pinned: boolean) => void
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
 *
 * Accepts nothing at all: the inset header can be showing a conversation the backend has no row for
 * yet, since it persists one only on the first turn.
 */
export function sessionLabel(session?: MobileSessionListItem | null): string {
  return session?.title?.trim() || session?.preview?.trim() || 'Untitled session'
}

/**
 * On a phone the session list is a drawer: anything picked inside it has to get out of the way of
 * what it opened, or the list keeps covering the conversation it just switched to. On a wide screen
 * the list is a permanent column, and there is nothing to close.
 *
 * Delegated from the document rather than threaded through every row: the pick is a menu-item press,
 * which also covers "start new session" and "refresh" — anything that changes what the pane shows.
 */
function CloseDrawerAfterPick() {
  const { isMobile, setOpenMobile } = useSidebar()
  useEffect(() => {
    if (!isMobile) return
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[data-slot=sidebar-menu-item]')) setOpenMobile(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [isMobile, setOpenMobile])
  return null
}

/** The profile picker: which workspace the gateway answers from. */
function ProfileSelect({ activeProfile, onSelectProfile, profiles }: {
  activeProfile: string
  onSelectProfile: (profile: string) => void
  profiles: MobileProfileSummary[]
}) {
  return <MobileSelect
    ariaLabel="Profile"
    groups={[{
      id: '',
      items: profiles.map(profile => ({ id: profile.name, label: profile.displayName || profile.name })),
      label: ''
    }]}
    label={profiles.find(profile => profile.name === activeProfile)?.displayName || activeProfile || 'Profile'}
    onSelect={profile => {
      if (profile !== activeProfile) {
        onSelectProfile(profile)
      }
    }}
    selectedGroupId=""
    selectedId={activeProfile}
  />
}

/**
 * The rail's profile picker.
 *
 * On a phone the rail is a modal dialog, and a menu portalled to `document.body` from inside one is inert
 * (see `MobileSelect`, which portals into the dialog instead). Picking a profile replaces the whole
 * workspace, so the drawer gets out of the way.
 */
function RailProfileSwitcher(props: {
  activeProfile: string
  onSelectProfile: (profile: string) => void
  profiles: MobileProfileSummary[]
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  if (props.profiles.length < 2) return null
  return <div className="px-1 pb-1">
    <ProfileSelect
      {...props}
      onSelectProfile={profile => {
        if (isMobile) setOpenMobile(false)
        props.onSelectProfile(profile)
      }}
    />
  </div>
}

export function IpadShell({
  activeProfile, activeSessionId, activeTitle, children, connectionMessage, gatewayHost, gatewayStatus,
  onCreate, onDelete, onDisconnect, onOpen, onRefresh, onRename, onSelectProfile, onSetPinned, profiles, sessions
}: IpadShellProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  // Null until the person drags: the primitives' own default width is the right starting point.
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const resizeRef = useRef<{ clientX: number, pending: number, pointerId: number, startWidth: number } | null>(null)
  const frameRef = useRef(0)

  /**
   * Drag the sidebar's right edge. Pointer events (not mouse/touch pairs) so a finger and a trackpad
   * drive the same code, and `touch-none` on the handle so the drag is not stolen by scrolling.
   */
  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    // A drag on iOS otherwise starts a native TEXT SELECTION: the blue selection paint covers the
    // footer (profile picker and status line included) and looks like a stray highlight block.
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    const width = sidebarWidth ?? event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    resizeRef.current = { clientX: event.clientX, pending: width, pointerId: event.pointerId, startWidth: width }
    setResizing(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    // One width per frame: pointer events arrive far faster than the screen paints, and a state update
    // per event re-renders the whole sidebar dozens of times a second mid-gesture.
    drag.pending = drag.startWidth + (event.clientX - drag.clientX)
    if (frameRef.current !== 0) {
      return
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      const pending = resizeRef.current?.pending
      if (pending != null) {
        setSidebarWidth(clampSidebarWidth(pending, window.innerWidth))
      }
    })
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (frameRef.current !== 0) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    if (resizeRef.current && event.currentTarget.hasPointerCapture?.(resizeRef.current.pointerId)) {
      event.currentTarget.releasePointerCapture(resizeRef.current.pointerId)
    }
    resizeRef.current = null
    setResizing(false)
    window.getSelection()?.removeAllRanges()
  }

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

  // Dismiss the sheet on a press anywhere outside it. Pointer events (capture phase) cover touch,
  // mouse and the row itself alike, so no scrim element is needed.
  useEffect(() => {
    if (menuFor === null) {
      return
    }
    function dismiss(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('[role="menu"]')) {
        return
      }
      setMenuFor(null)
    }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [menuFor])

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
    // Pins sit above the dated groups: the pin is what keeps an aged-out conversation reachable,
    // so it has to be findable without knowing which bucket it fell into.
    const pinned = matching.filter(session => session.pinned)
    // A pinned row appears only in the Pinned group, never twice.
    const datedRows = matching.filter(session => !session.pinned)
    const byBucket = new Map<string, SessionGroup>()

    for (const session of datedRows) {
      const bucket = calendarBucket(session.updatedAt ?? 0)
      const group = byBucket.get(bucket.key)

      if (group) {
        group.items.push(session)
      } else {
        byBucket.set(bucket.key, { items: [session], key: bucket.key, label: sessionBucketLabel(bucket, t.sidebar.dateDivider) })
      }
    }

    const dated = [...byBucket.values()]
    return pinned.length > 0
      ? [{ items: pinned, key: 'pinned', label: 'Pinned' }, ...dated]
      : dated
  }, [sessions, query, t])

  return (
    <SidebarProvider
      // The width is a CSS variable on the wrapper; passing it here is how the primitives' fixed
      // container, its gap and the inset all stay in agreement.
      // The rail is taken out of `position: fixed` here. A fixed element whose width is dragged has a
      // backing store WebKit reuses across the change, and the stale paint ended up ON TOP of the
      // footer after a background/foreground cycle. In flow there is no such layer: a width change is
      // ordinary layout. `!relative` beats the primitive's own `fixed` regardless of stylesheet order;
      // the gap spacer the primitive uses to reserve room for a fixed rail is hidden because the rail
      // now occupies that space itself.
      className={`${resizing ? '[&_*]:select-none [&_*]:transition-none! ' : ''}h-full min-h-0 [-webkit-tap-highlight-color:transparent] [&>[data-slot=sidebar]]:shrink-0 [&_[data-slot=sidebar-gap]]:hidden`}
      style={sidebarWidth == null ? undefined : { '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <CloseDrawerAfterPick />
      {/* `select-none` on the whole rail, not just while dragging: a selection started by a tap can
          outlive the tap, and the chrome has nothing worth selecting. The transcript stays selectable —
          it lives in the inset, outside this element. */}
      <Sidebar className="relative! select-none group-data-[state=collapsed]:hidden!" collapsible="offcanvas">
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
                        {renaming?.id !== session.id && <button
                          aria-label={`Actions for ${sessionLabel(session)}`}
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[color:var(--ui-text-tertiary)]"
                          onClick={event => {
                            // The sheet is reachable without discovering the long press.
                            event.stopPropagation()
                            setMenuFor(current => current === session.id ? null : session.id)
                            // Do not keep focus on the trigger: the menu button paints its focus ring
                            // with the same background as the active row, and the list reorders
                            // under it, so a retained focus reads as a second row being selected.
                            event.currentTarget.blur()
                          }}
                          type="button"
                        >
                          ⋯
                        </button>}
                        {menuFor === session.id && <div
                          className="absolute right-1 top-full z-50 flex flex-col rounded-lg border border-(--ui-stroke-tertiary) bg-[var(--ui-bg-primary)] py-1 shadow-lg"
                          role="menu"
                        >
                          <button
                            className="whitespace-nowrap px-4 py-1.5 text-left text-sm"
                            onClick={event => {
                              event.currentTarget.blur()
                              setMenuFor(null)
                              onSetPinned(session.id, !session.pinned)
                            }}
                            role="menuitem"
                            type="button"
                          >
                            {session.pinned ? 'Unpin' : 'Pin'}
                          </button>
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
                            onClick={event => {
                              event.currentTarget.blur()
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

        {/* `relative z-20`: the session list above is a scroll container, which WebKit composites as its
            own layer and can paint over a menu that escapes upward out of this footer. */}
        <SidebarFooter className="relative z-20 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <RailProfileSwitcher
            activeProfile={activeProfile}
            onSelectProfile={onSelectProfile}
            profiles={profiles}
          />
          {/* Which gateway this is, and whether anything is wrong — not a log. Session chatter and
              errors surface under the session title instead. */}
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-[color:var(--ui-text-tertiary)]">
            <Codicon name="globe" size="0.85rem" />
            <span className="min-w-0 flex-1 truncate">{gatewayHost || 'Gateway'}</span>
            {gatewayStatus.label && <span className="flex shrink-0 items-center gap-1">
              <Codicon
                className={gatewayStatus.tone === 'warn' ? 'text-[color:var(--ui-orange)]' : ''}
                name={gatewayStatus.tone === 'warn' ? 'warning' : 'pass-filled'}
                size="0.8rem"
              />
              <span className={gatewayStatus.tone === 'warn' ? 'text-[color:var(--ui-orange)]' : ''}>
                {gatewayStatus.label}
              </span>
            </span>}
          </div>
        </SidebarFooter>
        {/* The right edge is the grip. A finger drag widens the list, and the 90% clamp keeps a strip
            of the conversation visible so the sidebar reads as a layer over it, not the whole screen. */}
        <div
          aria-label="Resize session list"
          aria-orientation="vertical"
          className="absolute inset-y-0 right-0 z-30 w-3 cursor-col-resize touch-none select-none [-webkit-touch-callout:none]"
          onContextMenu={event => event.preventDefault()}
          onPointerCancel={endResize}
          onPointerDown={beginResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          role="separator"
        />
      </Sidebar>

      {/* `min-w-0` is load-bearing: a flex item's default `min-width: auto` refuses to shrink below its
          own content, so a wider sidebar pushed this pane off the right edge instead of narrowing it —
          which is how the composer ended up cut off.
          No `overflow-x-hidden` here: it turned the inset into a scroll container, and WebKit then
          stopped painting static descendants of the composer inside it (the model and thinking controls
          existed, hit-tested and measured 135x42 — and drew nothing). */}
      <SidebarInset className="min-w-0">
        <header className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <SidebarTrigger className="-ml-1" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {activeTitle || 'No session selected'}
            </p>
            {/* The line the sidebar footer used to carry: what just happened, and what failed. */}
            {connectionMessage && <p className="truncate text-[0.7rem] text-[color:var(--ui-text-tertiary)]">
              {connectionMessage}
            </p>}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
