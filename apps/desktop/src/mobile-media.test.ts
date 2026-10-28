import { describe, expect, it, vi } from 'vitest'

import { createMobileMediaLoader, mobileMediaUrl, toBytes, type MobileMediaRuntime } from './mobile-media'

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

  it('decodes a base64 body, which is how a native bridge serialises binary', async () => {
    // btoa('hi') === 'aGk=': a bridge that sends binary as text must not become an empty player.
    const deps = runtime({
      nativeGet: vi.fn(async () => ({ data: 'aGk=', headers: { 'content-type': 'audio/mpeg' }, status: 200 }))
    })
    let decoded: Blob | undefined
    const loader = createMobileMediaLoader({ baseUrl: 'https://gw.example', mode: 'secure' }, {
      ...deps,
      createObjectURL: (blob: Blob) => {
        decoded = blob

        return 'blob:decoded'
      }
    })

    await expect(loader('/srv/a.mp3')).resolves.toBe('blob:decoded')
    expect(decoded?.size).toBe(2)
  })

  it('names an unusable body instead of mounting an empty player', async () => {
    const deps = runtime({ nativeGet: vi.fn(async () => ({ data: {}, headers: {}, status: 200 })) })

    await expect(createMobileMediaLoader({ baseUrl: 'https://gw.example', mode: 'secure' }, deps)('/srv/a.mp3'))
      .rejects.toThrow('unusable body (object)')
  })

  it('reads every binary shape a bridge may produce', () => {
    expect(toBytes(new Uint8Array([1, 2, 3]))?.length).toBe(3)
    expect(toBytes([4, 5])?.length).toBe(2)
    expect(toBytes(new ArrayBuffer(7))?.length).toBe(7)
    expect(toBytes('aGk=')?.length).toBe(2)
    expect(toBytes('not base64!!')).toBeNull()
  })
})
