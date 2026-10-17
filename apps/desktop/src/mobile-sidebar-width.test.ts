import { describe, expect, it } from 'vitest'

import {
  clampSidebarWidth,
  MOBILE_SIDEBAR_MAX_RATIO,
  MOBILE_SIDEBAR_MIN_WIDTH
} from './mobile-sidebar-width'

describe('clampSidebarWidth', () => {
  it('caps the sidebar at 90% of the viewport', () => {
    // The strip that stays visible is what says "this is a layer, not the screen".
    expect(MOBILE_SIDEBAR_MAX_RATIO).toBe(0.9)
    expect(clampSidebarWidth(5000, 834)).toBe(751)
    expect(clampSidebarWidth(800, 834)).toBe(751)
  })

  it('will not collapse the sidebar to an unusable sliver', () => {
    expect(clampSidebarWidth(20, 834)).toBe(MOBILE_SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(-400, 834)).toBe(MOBILE_SIDEBAR_MIN_WIDTH)
  })

  it('leaves a legal width alone, and follows the viewport when the device rotates', () => {
    expect(clampSidebarWidth(320, 834)).toBe(320)
    // Same drag, narrower viewport: the ratio wins over the stored pixels.
    expect(clampSidebarWidth(320, 320)).toBe(288)
  })

  it('stays usable on a viewport narrower than the minimum', () => {
    expect(clampSidebarWidth(400, 150)).toBe(135)
  })
})
