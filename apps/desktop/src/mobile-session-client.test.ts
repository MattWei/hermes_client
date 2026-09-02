import { describe, expect, it, vi } from 'vitest'

import { createMobileSessionClient } from './mobile-session-client'

describe('createMobileSessionClient', () => {
  it('creates a session with mobile-safe defaults and preserves runtime and stored identities', async () => {
    const request = vi.fn(async () => ({
      session_id: 'runtime-42',
      stored_session_id: 'stored-42'
    }))
    const client = createMobileSessionClient({ request })

    await expect(client.create('New mobile chat')).resolves.toEqual({
      runtimeSessionId: 'runtime-42',
      storedSessionId: 'stored-42'
    })
    expect(request).toHaveBeenCalledWith('session.create', {
      cols: 80,
      source: 'mobile',
      title: 'New mobile chat'
    })
  })

  it('rejects a malformed session.create response instead of selecting an unknown session', async () => {
    const client = createMobileSessionClient({ request: vi.fn(async () => ({ stored_session_id: 'stored-42' })) })

    await expect(client.create('New mobile chat')).rejects.toThrow('runtime session id')
  })

  it('lists the current backend sessions through the existing REST client', async () => {
    const get = vi.fn(async () => new Response(JSON.stringify({
      limit: 40,
      offset: 0,
      sessions: [{ id: 'stored-1', preview: 'Latest message', title: 'Existing chat' }],
      total: 1
    })))
    const client = createMobileSessionClient({ request: vi.fn() }, { get })

    await expect(client.list()).resolves.toEqual([
      { id: 'stored-1', preview: 'Latest message', title: 'Existing chat' }
    ])
    expect(get).toHaveBeenCalledWith('/api/sessions?limit=40&offset=0&min_messages=0&archived=exclude&order=recent')
  })

  it('rejects an invalid session-list response', async () => {
    const client = createMobileSessionClient({ request: vi.fn() }, {
      get: vi.fn(async () => new Response(JSON.stringify({ sessions: 'not-an-array' })))
    })

    await expect(client.list()).rejects.toThrow('session list')
  })

  it('resumes a fresh stored session with an empty transcript when history is not persisted yet', async () => {
    const request = vi.fn(async () => ({ session_id: 'runtime-fresh', session_key: 'stored-fresh' }))
    const get = vi.fn(async () => new Response(JSON.stringify({ detail: 'Session not found' }), { status: 404 }))
    const client = createMobileSessionClient({ request }, { get })

    await expect(client.resume('stored-fresh')).resolves.toEqual({
      messages: [],
      runtimeSessionId: 'runtime-fresh',
      storedSessionId: 'stored-fresh'
    })
  })

  it('resumes a stored session and hydrates its REST history with Desktop message mapping', async () => {
    const request = vi.fn(async () => ({ session_id: 'runtime-2', session_key: 'stored-2' }))
    const get = vi.fn(async () => new Response(JSON.stringify({
      messages: [
        { content: 'Earlier user message', role: 'user', timestamp: 1 },
        { content: 'Earlier reply', role: 'assistant', timestamp: 2 }
      ],
      session_id: 'stored-2'
    })))
    const client = createMobileSessionClient({ request }, { get })

    await expect(client.resume('stored-2')).resolves.toMatchObject({
      messages: [{ role: 'user' }, { role: 'assistant' }],
      runtimeSessionId: 'runtime-2',
      storedSessionId: 'stored-2'
    })
    expect(request).toHaveBeenCalledWith('session.resume', { cols: 80, omit_messages: true, session_id: 'stored-2' })
    expect(get).toHaveBeenCalledWith('/api/sessions/stored-2/messages?limit=120&order=latest&include_compacted=true')
  })
})
