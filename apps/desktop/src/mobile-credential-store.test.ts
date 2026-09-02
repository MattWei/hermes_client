import { describe, expect, it, vi } from 'vitest'

import { createMobileCredentialStore } from './mobile-credential-store'

describe('createMobileCredentialStore', () => {
  it('stores and reads only the access and refresh token pair through the native store', async () => {
    const values = new Map<string, string>()

    const nativeStore = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      remove: vi.fn(async (key: string) => {
        values.delete(key)
      }),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value)
      })
    }

    const store = createMobileCredentialStore(nativeStore)

    await store.save({ accessToken: 'access', refreshToken: 'refresh' })

    expect(nativeStore.set).toHaveBeenCalledTimes(2)
    await expect(store.read()).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' })
  })

  it('stores and reads a LAN static session token through the native store', async () => {
    const values = new Map<string, string>()

    const nativeStore = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      remove: vi.fn(async (key: string) => {
        values.delete(key)
      }),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value)
      })
    }

    const store = createMobileCredentialStore(nativeStore)

    await store.saveLanSessionToken('lan-token')

    await expect(store.readLanSessionToken()).resolves.toBe('lan-token')
    expect(nativeStore.set).toHaveBeenCalledWith('hermes.mobile.lan-session-token', 'lan-token')
  })

  it('clears both tokens when either stored value is absent', async () => {
    const nativeStore = {
      get: vi.fn(async (key: string) => (key === 'hermes.mobile.access-token' ? 'access' : null)),
      remove: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined)
    }

    await expect(createMobileCredentialStore(nativeStore).read()).resolves.toBeNull()
    expect(nativeStore.remove).toHaveBeenCalledWith('hermes.mobile.access-token')
    expect(nativeStore.remove).toHaveBeenCalledWith('hermes.mobile.refresh-token')
  })

  it('fails closed when the native store rejects', async () => {
    const nativeStore = {
      get: vi.fn(async () => {
        throw new Error('native store unavailable')
      }),
      remove: vi.fn(async () => undefined),
      set: vi.fn(async () => {
        throw new Error('native store unavailable')
      })
    }

    await expect(
      createMobileCredentialStore(nativeStore).save({ accessToken: 'access', refreshToken: 'refresh' })
    ).rejects.toThrow('native store unavailable')
  })
})
