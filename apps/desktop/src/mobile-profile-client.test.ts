import { describe, expect, it, vi } from 'vitest'

import { createMobileProfileClient, type MobileProfileRest } from './mobile-profile-client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

function restWith(response: Response): MobileProfileRest {
  return { get: vi.fn(async () => response) }
}

describe('createMobileProfileClient', () => {
  it('lists profiles from the gateway', async () => {
    const rest = restWith(json({
      profiles: [
        { display_name: '', is_default: true, model: 'deepseek-v4-flash', name: 'default', provider: 'deepseek' },
        { display_name: 'Work', is_default: false, model: 'claude-sonnet-4', name: 'work', provider: 'anthropic' }
      ]
    }))

    await expect(createMobileProfileClient(rest).list()).resolves.toEqual([
      { displayName: 'default', isDefault: true, model: 'deepseek-v4-flash', name: 'default', provider: 'deepseek' },
      { displayName: 'Work', isDefault: false, model: 'claude-sonnet-4', name: 'work', provider: 'anthropic' }
    ])
    expect(rest.get).toHaveBeenCalledWith('/api/profiles')
  })

  it('falls back to the profile name when the gateway sends no display name', async () => {
    // The gateway leaves display_name empty for ordinary profiles, so the name is the real label.
    const rest = restWith(json({ profiles: [{ display_name: '', name: 'default' }] }))

    await expect(createMobileProfileClient(rest).list()).resolves.toEqual([
      { displayName: 'default', isDefault: false, model: null, name: 'default', provider: null }
    ])
  })

  it('drops entries without a usable name', async () => {
    const rest = restWith(json({ profiles: [{ display_name: 'Nameless' }, { name: 'ok' }] }))

    await expect(createMobileProfileClient(rest).list()).resolves.toEqual([
      { displayName: 'ok', isDefault: false, model: null, name: 'ok', provider: null }
    ])
  })

  it('reports an expired session distinctly', async () => {
    await expect(createMobileProfileClient(restWith(json({ detail: 'nope' }, 401))).list())
      .rejects.toThrow('session expired')
  })

  it('does not echo the server body on an unexpected failure', async () => {
    await expect(createMobileProfileClient(restWith(json({ detail: 'internal leak' }, 500))).list())
      .rejects.toThrow('Unable to list profiles (HTTP 500)')
  })
})
