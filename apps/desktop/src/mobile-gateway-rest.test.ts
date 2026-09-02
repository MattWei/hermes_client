import { describe, expect, it, vi } from 'vitest'

import { createMobileGatewayRestClient } from './mobile-gateway-rest'

describe('createMobileGatewayRestClient', () => {
  it('sends a LAN request with the static session-token header', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })))

    const client = createMobileGatewayRestClient(
      {
        baseUrl: 'http://10.10.10.10:9119',
        mode: 'lan',
        token: 'lan-token'
      },
      fetchFn
    )

    await client.get('/api/sessions')

    expect(fetchFn).toHaveBeenCalledWith('http://10.10.10.10:9119/api/sessions', {
      headers: { 'X-Hermes-Session-Token': 'lan-token' }
    })
  })

  it('uses Capacitor native HTTP for a LAN request on a native runtime', async () => {
    const fetchFn = vi.fn()

    const get = vi.fn(async () => ({
      data: { sessions: [] },
      headers: { 'content-type': 'application/json' },
      status: 200,
      url: 'http://10.10.10.10:9119/api/sessions'
    }))

    const client = createMobileGatewayRestClient(
      {
        baseUrl: 'http://10.10.10.10:9119',
        mode: 'lan',
        token: 'lan-token'
      },
      fetchFn,
      {
        isNativePlatform: () => true,
        nativeHttp: { get }
      }
    )

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

    const client = createMobileGatewayRestClient(
      {
        baseUrl: 'https://hermes.example.test',
        mode: 'secure',
        accessToken: 'access-token',
        token: 'must-not-appear'
      },
      fetchFn
    )

    await client.get('/api/sessions')

    expect(fetchFn).toHaveBeenCalledWith('https://hermes.example.test/api/sessions', {
      headers: { Authorization: 'Bearer access-token' }
    })
  })

  it('refuses REST calls when the selected mode lacks its required credential', () => {
    expect(() =>
      createMobileGatewayRestClient(
        {
          baseUrl: 'http://10.10.10.10:9119',
          mode: 'lan'
        },
        vi.fn()
      )
    ).toThrow('session token')

    expect(() =>
      createMobileGatewayRestClient(
        {
          baseUrl: 'https://hermes.example.test',
          mode: 'secure'
        },
        vi.fn()
      )
    ).toThrow('access token')
  })
})
