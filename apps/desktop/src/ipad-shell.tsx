import { useMemo, useState, type ReactNode } from 'react'

import { SearchField } from './components/ui/search-field'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from './components/ui/sidebar'
import { useI18n } from './i18n'
import { normalize } from './lib/text'
import { calendarBucket, sessionBucketLabel } from './lib/time'
import type { MobileSessionListItem } from './mobile-session-client'

interface IpadShellProps {
  activeSessionId: string | null
  activeTitle: string | null
  children: ReactNode
  connectionMessage: string
  onCreate: () => void
  onDisconnect: () => void
  onOpen: (storedSessionId: string) => void
  onRefresh: () => void
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
export function IpadShell({
  activeSessionId, activeTitle, children, connectionMessage, onCreate, onDisconnect, onOpen, onRefresh, sessions
}: IpadShellProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

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
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="pt-[max(1.5rem,env(safe-area-inset-top))]">
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
                      <SidebarMenuItem key={session.id}>
                        <SidebarMenuButton
                          aria-label={`Open ${session.title || 'Untitled session'}`}
                          isActive={session.id === activeSessionId}
                          onClick={() => onOpen(session.id)}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">{session.title || 'Untitled session'}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
        </SidebarContent>

        <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <SidebarMenuButton onClick={onDisconnect}>
            <span className="truncate">Disconnect gateway</span>
          </SidebarMenuButton>
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
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
