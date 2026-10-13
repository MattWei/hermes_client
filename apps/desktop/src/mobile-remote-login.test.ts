import { describe, expect, it, vi } from 'vitest'

import { createMobileRemoteLoginClient, type RemoteLoginRest } from './mobile-remote-login'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

function restWith(handlers: { get?: Response; post?: Response[] }): RemoteLoginRest {
  const posts = [...(handlers.post ?? [])]
  return {
    get: vi.fn(async () => handlers.get ?? json({ providers: [] })),
    post: vi.fn(async () => posts.shift() ?? json({ ok: true }))
  }
}

describe('createMobileRemoteLoginClient', () => {
  it('lists only providers that accept a password', async () => {
    const rest = restWith({
      get: json({
        providers: [
          { display_name: 'Username & Password', name: 'basic', supports_password: true },
          { display_name: 'Nous Portal', name: 'nous', supports_password: false },
          { name: 'no-flag' }
        ]
      })
    })

    await expect(createMobileRemoteLoginClient(rest).listPasswordProviders()).resolves.toEqual([
      { displayName: 'Username & Password', name: 'basic' }
    ])
  })

  it('falls back to the provider id when no display name is given', async () => {
    const rest = restWith({ get: json({ providers: [{ name: 'basic', supports_password: true }] }) })

    await expect(createMobileRemoteLoginClient(rest).listPasswordProviders()).resolves.toEqual([
      { displayName: 'basic', name: 'basic' }
    ])
  })

  it('posts credentials to the password-login route', async () => {
    const rest = restWith({ post: [json({ ok: true, next: '/' })] })

    await createMobileRemoteLoginClient(rest).signIn('basic', 'alice', 'secret')

    expect(rest.post).toHaveBeenCalledWith('/auth/password-login', {
      password: 'secret',
      provider: 'basic',
      username: 'alice'
    })
  })

  it.each([
    [401, 'Invalid username or password'],
    [404, 'does not offer username and password sign-in'],
    [429, 'Too many sign-in attempts'],
    [503, 'could not reach its credential store']
  ])('turns HTTP %i into actionable copy', async (status, expected) => {
    const rest = restWith({ post: [json({ detail: 'server text that must not be surfaced' }, status)] })

    await expect(createMobileRemoteLoginClient(rest).signIn('basic', 'alice', 'wrong'))
      .rejects.toThrow(expected)
  })

  it('does not echo the server error body on an unexpected failure', async () => {
    const rest = restWith({ post: [json({ detail: 'internal leak' }, 500)] })

    await expect(createMobileRemoteLoginClient(rest).signIn('basic', 'alice', 'x'))
      .rejects.toThrow('Sign-in failed (HTTP 500)')
  })

  it('mints a WebSocket ticket', async () => {
    const rest = restWith({ post: [json({ ticket: 'one-shot', ttl_seconds: 30 })] })

    await expect(createMobileRemoteLoginClient(rest).mintWsTicket()).resolves.toBe('one-shot')
    expect(rest.post).toHaveBeenCalledWith('/api/auth/ws-ticket')
  })

  it('reports an expired session distinctly from a missing ticket', async () => {
    const expired = restWith({ post: [json({ detail: 'nope' }, 401)] })
    await expect(createMobileRemoteLoginClient(expired).mintWsTicket())
      .rejects.toThrow('session expired')

    const empty = restWith({ post: [json({ ttl_seconds: 30 })] })
    await expect(createMobileRemoteLoginClient(empty).mintWsTicket())
      .rejects.toThrow('no WebSocket ticket')
  })
})
