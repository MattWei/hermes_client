import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mergePinsFromRows, readCachedPins, writeCachedPins } from './mobile-session-pins'

describe('mobile session pin cache', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trips the pinned ids for a profile', () => {
    writeCachedPins('shopify', ['stored-1', 'stored-2'])

    expect([...readCachedPins('shopify')].sort()).toEqual(['stored-1', 'stored-2'])
  })

  it('keeps profiles apart, since a session id is only unique inside one', () => {
    writeCachedPins('shopify', ['stored-1'])
    writeCachedPins('default', ['stored-9'])

    expect([...readCachedPins('shopify')]).toEqual(['stored-1'])
    expect([...readCachedPins('default')]).toEqual(['stored-9'])
  })

  it('treats the unnamed launch profile as one bucket', () => {
    writeCachedPins('', ['stored-3'])

    expect([...readCachedPins('')]).toEqual(['stored-3'])
  })

  it('has nothing to show before anything was written', () => {
    expect([...readCachedPins('shopify')]).toEqual([])
  })

  it('survives a corrupt entry instead of throwing', () => {
    window.localStorage.setItem('hermes.mobile.pinned.shopify', '{not json')

    expect([...readCachedPins('shopify')]).toEqual([])
  })

  it('drops non-string entries rather than trusting them', () => {
    window.localStorage.setItem('hermes.mobile.pinned.shopify', JSON.stringify(['ok', 7, null, { id: 'x' }]))

    expect([...readCachedPins('shopify')]).toEqual(['ok'])
  })

  it('takes the server row as the truth for the rows it carries', () => {
    writeCachedPins('shopify', ['stale-1', 'kept-1'])

    // The page says stale-1 is no longer pinned and introduces a new one; both must land, while a
    // row the page never mentioned is left alone.
    const remaining = mergePinsFromRows('shopify', [
      { id: 'stale-1', pinned: false },
      { id: 'fresh-1', pinned: true }
    ])

    expect([...remaining].sort()).toEqual(['fresh-1', 'kept-1'])
    expect([...readCachedPins('shopify')].sort()).toEqual(['fresh-1', 'kept-1'])
  })

  it('does not throw when storage refuses to write', () => {
    const failing = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(() => writeCachedPins('shopify', ['stored-4'])).not.toThrow()
    failing.mockRestore()
  })
})
