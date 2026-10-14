import { describe, expect, it, vi } from 'vitest'

import { createMobileGatewayRestClient } from './mobile-gateway-rest'

const nativeResponse = (data: unknown, status = 200) => ({
  data,
  headers: { 'content-type': 'application/json' },
  status,
  url: 'http://10.10.10.10:9119/api/sessions'
})

describe('createMobileGatewayRestClient', () => {
  it('sends a LAN request with the static session-token header', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })))
    const client = createMobileGatewayRestClient({
      baseUrl: 'http://10.10.10.10:9119',
      mode: 'lan',
      token: 'lan-token'
    }, fetchFn)

    await client.get('/api/sessions')

    expect(fetchFn).toHaveBeenCalledWith('http://10.10.10.10:9119/api/sessions', {
      body: undefined,
      headers: { 'X-Hermes-Session-Token': 'lan-token' },
      method: 'GET'
    })
  })

  it('uses Capacitor native HTTP for a LAN request on a native runtime', async () => {
    const fetchFn = vi.fn()
    const get = vi.fn(async () => nativeResponse({ sessions: [] }))
    const client = createMobileGatewayRestClient({
      baseUrl: 'http://10.10.10.10:9119',
      mode: 'lan',
      token: 'lan-token'
    }, fetchFn, {
      isNativePlatform: () => true,
      nativeHttp: { delete: vi.fn(), get, patch: vi.fn(), post: vi.fn() }
    })

    const response = await client.get('/api/sessions')

    expect(get).toHaveBeenCalledWith({
      url: 'http://10.10.10.10:9119/api/sessions',
      headers: { 'X-Hermes-Session-Token': 'lan-token' },
      responseType: 'text'
    })
    expect(fetchFn).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ sessions: [] })
  })

  it('sends a secure request with Bearer credentials and never a LAN header', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })))
    const client = createMobileGatewayRestClient({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure',
      accessToken: 'access-token',
      token: 'must-not-appear'
    }, fetchFn)

    await client.get('/api/sessions')

    expect(fetchFn).toHaveBeenCalledWith('https://hermes.example.test/api/sessions', {
      body: undefined,
      headers: { Authorization: 'Bearer access-token' },
      method: 'GET'
    })
  })

  it('sends no credential header in secure mode when no access token is set', async () => {
    // The dashboard-login shape: authentication rides the session cookie attached by the native
    // HTTP layer, so emitting an empty Authorization header would be a defect, not a fallback.
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })))
    const client = createMobileGatewayRestClient({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure'
    }, fetchFn)

    await client.get('/api/sessions')

    expect(fetchFn).toHaveBeenCalledWith('https://hermes.example.test/api/sessions', {
      body: undefined,
      headers: {},
      method: 'GET'
    })
  })

  it('POSTs JSON to a gateway auth route through the native runtime', async () => {
    const post = vi.fn(async () => nativeResponse({ ok: true }))
    const client = createMobileGatewayRestClient({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure'
    }, vi.fn(), {
      isNativePlatform: () => true,
      nativeHttp: { delete: vi.fn(), get: vi.fn(), patch: vi.fn(), post }
    })

    await client.post('/auth/password-login', { password: 'p', provider: 'basic', username: 'u' })

    expect(post).toHaveBeenCalledWith({
      data: { password: 'p', provider: 'basic', username: 'u' },
      headers: { 'Content-Type': 'application/json' },
      responseType: 'text',
      url: 'https://hermes.example.test/auth/password-login'
    })
  })

  it('still refuses a LAN connection with no session token', () => {
    expect(() => createMobileGatewayRestClient({
      baseUrl: 'http://10.10.10.10:9119',
      mode: 'lan'
    }, vi.fn())).toThrow('session token')
  })

  it('rejects paths outside the gateway API surface', async () => {
    const client = createMobileGatewayRestClient({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure'
    }, vi.fn())

    await expect(client.get('/etc/passwd')).rejects.toThrow('/api/ or /auth/')
  })
})
