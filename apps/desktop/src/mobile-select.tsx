import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Codicon } from './components/ui/codicon'

export interface MobileSelectOption {
  id: string
  label: string
}

/** A list of options under one heading. A group with an empty label is a flat list and renders no heading. */
export interface MobileSelectOptionGroup {
  id: string
  items: MobileSelectOption[]
  label: string
}

const MENU_WIDTH = 240
const VIEWPORT_MARGIN = 8

/**
 * One selector: a quiet label with a chevron, opening a list upward.
 *
 * The list renders into `document.body` as a fixed-position layer rather than inside the control.
 * Measured on the device, an in-place list had correct geometry (240x80, opacity 1, visibility visible)
 * and painted nothing whenever it escaped upward over a scrolling region — WebKit composites a scroll
 * container above positioned siblings, so the menu was drawn "behind" the session list. A portal has no
 * scrolling ancestor at all, which is also what the desktop's own menus do.
 */
export function MobileSelect({ ariaLabel, groups, label, onSelect, selectedGroupId, selectedId }: {
  ariaLabel: string
  groups: MobileSelectOptionGroup[]
  label: string
  onSelect: (id: string, groupId: string) => void
  selectedGroupId: string
  selectedId: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ bottom: number, left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  function openAtTrigger() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setAnchor({
        // Opens upward: these controls sit at the bottom of their surface.
        bottom: window.innerHeight - rect.top + 6,
        left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN))
      })
    }
    setOpen(true)
  }

  // Tapping anywhere outside closes the list, as does Escape.
  //
  // Deliberately no close-on-scroll: opening the list scrolls IT to the current row, and a window-level
  // scroll listener saw its own programmatic scroll and closed the menu on the same frame — a menu that
  // flashed and vanished.
  useEffect(() => {
    if (!open) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Open the list on the pick that is actually in force. An open menu that starts at the top makes
  // someone hunt for the row the control is already advertising.
  useEffect(() => {
    const list = listRef.current
    if (!open || !list) {
      return
    }
    const current = list.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!current) {
      return
    }
    // Move the list itself, never `scrollIntoView`: that walks every scrollable ancestor and would
    // drag the transcript along with it.
    const listRect = list.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()
    const visibleTop = listRect.top + list.clientTop
    const visibleBottom = visibleTop + list.clientHeight
    if (currentRect.top < visibleTop) {
      list.scrollTop -= visibleTop - currentRect.top
    } else if (currentRect.bottom > visibleBottom) {
      list.scrollTop += currentRect.bottom - visibleBottom
    }
  }, [open])

  return <div className="relative" ref={rootRef}>
    <button
      aria-expanded={open}
      aria-label={ariaLabel}
      className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-[color:var(--ui-text-tertiary)]"
      onClick={() => (open ? setOpen(false) : openAtTrigger())}
      ref={buttonRef}
      type="button"
    >
      <span className="max-w-44 truncate">{label}</span>
      <Codicon name={open ? 'chevron-up' : 'chevron-down'} size="0.7rem" />
    </button>
    {open && anchor && createPortal(
      <div
        className="fixed z-[100] max-h-64 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary) bg-background p-1 shadow-lg"
        ref={listRef}
        role="menu"
        style={{ bottom: anchor.bottom, left: anchor.left, width: MENU_WIDTH }}
      >
        {groups.map(group => <div key={group.id}>
          {group.label && <p className="px-2 pb-0.5 pt-1 text-[0.65rem] uppercase tracking-wider text-[color:var(--ui-text-tertiary)]">
            {group.label}
          </p>}
          {group.items.map(option => {
            const checked = option.id === selectedId && group.id === selectedGroupId
            return <button
              aria-checked={checked}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${checked ? 'text-[color:var(--ui-text-primary)]' : ''}`}
              key={option.id}
              onClick={() => { onSelect(option.id, group.id); setOpen(false) }}
              role="menuitemradio"
              type="button"
            >
              <span className="flex-1 truncate">{option.label}</span>
              {checked && <Codicon name="check" size="0.8rem" />}
            </button>
          })}
        </div>)}
      </div>,
      document.body
    )}
  </div>
}
