/**
 * Bounds for the draggable mobile sidebar.
 *
 * The cap is a ratio, not a pixel value: on a tablet the sidebar is dragged with a finger, and a width
 * stored in pixels would be wrong the moment the device rotates or the app runs in a narrower window.
 * 90% keeps a strip of the conversation visible, which is what tells a person the sidebar is a layer
 * over the session rather than the whole screen.
 */

export const MOBILE_SIDEBAR_MIN_WIDTH = 180

export const MOBILE_SIDEBAR_MAX_RATIO = 0.9

export function clampSidebarWidth(desired: number, viewportWidth: number): number {
  // The 90% cap outranks the minimum: "never fill the screen" is the promise that has to hold even on a
  // viewport narrower than a usable sidebar.
  const max = Math.round(viewportWidth * MOBILE_SIDEBAR_MAX_RATIO)
  const floor = Math.min(MOBILE_SIDEBAR_MIN_WIDTH, max)
  return Math.min(max, Math.max(floor, Math.round(desired)))
}
