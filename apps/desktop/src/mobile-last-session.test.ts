import { beforeEach, describe, expect, it } from 'vitest'

import { forgetLastSession, readLastSession, rememberLastSession } from './mobile-last-session'

describe('last opened session', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('remembers the conversation for its profile', () => {
    rememberLastSession('shopify', 'stored-1')

    expect(readLastSession('shopify')).toBe('stored-1')
  })

  it('keeps profiles apart, since a session id is only unique inside one', () => {
    rememberLastSession('shopify', 'stored-1')
    rememberLastSession('default', 'stored-9')

    expect(readLastSession('shopify')).toBe('stored-1')
    expect(readLastSession('default')).toBe('stored-9')
  })

  it('has nothing to restore before anything was opened', () => {
    expect(readLastSession('shopify')).toBeNull()
  })

  it('forgets on demand, so a sign-out starts clean', () => {
    rememberLastSession('shopify', 'stored-2')
    forgetLastSession('shopify')

    expect(readLastSession('shopify')).toBeNull()
  })

  it('survives a store that refuses to read or write', () => {
    const failing = window.localStorage
    const setItem = failing.setItem
    failing.setItem = () => {
      throw new Error('quota')
    }

    expect(() => rememberLastSession('shopify', 'stored-3')).not.toThrow()
    failing.setItem = setItem

    window.localStorage.setItem('hermes.mobile.last-session.shopify', '')
    expect(readLastSession('shopify')).toBeNull()
  })
})
