import { describe, expect, it, vi } from 'vitest'

import { createMobileMediaLoader, mobileMediaUrl, type MobileMediaRuntime } from './mobile-media'

function runtime(overrides: Partial<MobileMediaRuntime> = {}): MobileMediaRuntime {
  return {
    createObjectURL: vi.fn(() => 'blob:playable'),
    fetchBlob: vi.fn(async () => ({ blob: new Blob(['bytes']), status: 200 })),
    isNativePlatform: () => true,
    nativeGet: vi.fn(async () => ({
      data: new ArrayBuffer(8),
      headers: { 'content-type': 'audio/mpeg' },
      status: 200
    })),
    ...overrides
  }
}

describe('mobile media', () => {
  it('asks the gateway for the file rather than opening a file:// path', () => {
    expect(mobileMediaUrl({ baseUrl: 'https://gw.example', mode: 'secure' }, '/srv/media/drill.mp3'))
      .toBe('https://gw.example/api/files/stream?path=%2Fsrv%2Fmedia%2Fdrill.mp3')
  })

  it('strips the file:// scheme the markdown may carry', () => {
    expect(mobileMediaUrl({ baseUrl: 'https://gw.example', mode: 'secure' }, 'file:///srv/media/drill.mp3'))
      .toBe('https://gw.example/api/files/stream?path=%2Fsrv%2Fmedia%2Fdrill.mp3')
  })

  it('returns a playable object URL from the native buffer', async () => {
    const deps = runtime()

    await expect(createMobileMediaLoader({ baseUrl: 'https://gw.example', mode: 'secure' }, deps)('/srv/a.mp3'))
      .resolves.toBe('blob:playable')
    expect(deps.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/mpeg' }))
  })

  it('authenticates a LAN fetch with the session token header', async () => {
    const deps = runtime()

    await createMobileMediaLoader({ baseUrl: 'http://10.0.0.2:9119', mode: 'lan', token: 'lan-token' }, deps)('/srv/a.mp3')

    expect(deps.nativeGet).toHaveBeenCalledWith(expect.objectContaining({
      headers: { 'X-Hermes-Session-Token': 'lan-token' }
    }))
  })

  it('sends no auth header on a secure connection, where the cookie carries it', async () => {
    const deps = runtime()

    await createMobileMediaLoader({ baseUrl: 'https://gw.example', mode: 'secure' }, deps)('/srv/a.mp3')

    expect(deps.nativeGet).toHaveBeenCalledWith(expect.objectContaining({ headers: {} }))
  })

  it('refuses a refused file instead of handing back an empty player', async () => {
    const deps = runtime({ nativeGet: vi.fn(async () => ({ data: '', headers: {}, status: 404 })) })

    await expect(createMobileMediaLoader({ baseUrl: 'https://gw.example', mode: 'secure' }, deps)('/srv/missing.mp3'))
      .rejects.toThrow('HTTP 404')
  })

  it('uses the web fetch path when there is no native layer', async () => {
    const deps = runtime({ isNativePlatform: () => false })

    await expect(createMobileMediaLoader({ baseUrl: 'https://gw.example', mode: 'secure' }, deps)('/srv/a.mp3'))
      .resolves.toBe('blob:playable')
    expect(deps.fetchBlob).toHaveBeenCalled()
  })
})
