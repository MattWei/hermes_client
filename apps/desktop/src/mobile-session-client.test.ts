import { describe, expect, it, vi } from 'vitest'

import { createMobileSessionClient } from './mobile-session-client'

describe('createMobileSessionClient', () => {
  it('creates a session with mobile-safe defaults and preserves runtime and stored identities', async () => {
    const request = vi.fn(async () => ({
      session_id: 'runtime-42',
      stored_session_id: 'stored-42'
    }))
    const client = createMobileSessionClient({ request })

    await expect(client.create()).resolves.toEqual({
      runtimeSessionId: 'runtime-42',
      storedSessionId: 'stored-42'
    })
    // No title: the backend auto-names the session, and an invented placeholder would be stored
    // permanently and hide the preview fallback in the list.
    expect(request).toHaveBeenCalledWith('session.create', {
      cols: 80,
      source: 'mobile'
    })
  })

  it('binds a new session to the selected profile', async () => {
    const request = vi.fn(async () => ({ session_id: 'runtime-43', stored_session_id: 'stored-43' }))

    await createMobileSessionClient({ request }).create('shopify')

    expect(request).toHaveBeenCalledWith('session.create', {
      cols: 80,
      profile: 'shopify',
      source: 'mobile'
    })
  })

  it('rejects a malformed session.create response instead of selecting an unknown session', async () => {
    const client = createMobileSessionClient({ request: vi.fn(async () => ({ stored_session_id: 'stored-42' })) })

    await expect(client.create()).rejects.toThrow('runtime session id')
  })

  it('lists the current backend sessions through the existing REST client', async () => {
    const get = vi.fn(async () => new Response(JSON.stringify({
      limit: 40,
      offset: 0,
      sessions: [{ id: 'stored-1', preview: 'Latest message', title: 'Existing chat' }],
      total: 1
    })))
    const client = createMobileSessionClient({ request: vi.fn() }, { get, patch: vi.fn(), remove: vi.fn() })

    await expect(client.list()).resolves.toEqual([
      { id: 'stored-1', preview: 'Latest message', title: 'Existing chat', updatedAt: null }
    ])
    expect(get).toHaveBeenCalledWith('/api/sessions?limit=40&offset=0&min_messages=1&archived=exclude&order=recent')
  })

  it('carries the recency timestamp the sidebar groups by, preferring last_active', async () => {
    const get = vi.fn(async () => new Response(JSON.stringify({
      sessions: [
        { id: 'both', last_active: 2000, preview: null, started_at: 1000, title: 'Both' },
        { id: 'started-only', preview: null, started_at: 3000, title: 'Started only' },
        { id: 'neither', preview: null, title: 'Neither' }
      ]
    })))
    const client = createMobileSessionClient({ request: vi.fn() }, { get, patch: vi.fn(), remove: vi.fn() })

    await expect(client.list()).resolves.toEqual([
      { id: 'both', preview: null, title: 'Both', updatedAt: 2000 },
      { id: 'started-only', preview: null, title: 'Started only', updatedAt: 3000 },
      { id: 'neither', preview: null, title: 'Neither', updatedAt: null }
    ])
  })

  it('rejects an invalid session-list response', async () => {
    const client = createMobileSessionClient({ request: vi.fn() }, {
      get: vi.fn(async () => new Response(JSON.stringify({ sessions: 'not-an-array' }))),
      patch: vi.fn(),
      remove: vi.fn()
    })

    await expect(client.list()).rejects.toThrow('session list')
  })

  it('resumes a fresh stored session with an empty transcript when history is not persisted yet', async () => {
    const request = vi.fn(async () => ({ session_id: 'runtime-fresh', session_key: 'stored-fresh' }))
    const get = vi.fn(async () => new Response(JSON.stringify({ detail: 'Session not found' }), { status: 404 }))
    const client = createMobileSessionClient({ request }, { get, patch: vi.fn(), remove: vi.fn() })

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
    const client = createMobileSessionClient({ request }, { get, patch: vi.fn(), remove: vi.fn() })

    await expect(client.resume('stored-2')).resolves.toMatchObject({
      messages: [{ role: 'user' }, { role: 'assistant' }],
      runtimeSessionId: 'runtime-2',
      storedSessionId: 'stored-2'
    })
    expect(request).toHaveBeenCalledWith('session.resume', { cols: 80, omit_messages: true, session_id: 'stored-2' })
    expect(get).toHaveBeenCalledWith('/api/sessions/stored-2/messages?limit=120&order=latest&include_compacted=true')
  })
  it('resumes and reads history inside the selected profile', async () => {
    const request = vi.fn(async () => ({
      session_id: 'runtime-7', session_key: 'stored-7', stored_session_id: 'stored-7'
    }))
    const get = vi.fn(async (path: string) => {
      if (path.includes('/messages')) {
        return new Response(JSON.stringify({
          messages: [{ content: 'From the shopify store', role: 'user', timestamp: 1 }],
          session_id: 'stored-7'
        }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })

    const client = createMobileSessionClient({ request } as never, { get } as never)
    const resumed = await client.resume('stored-7', 'shopify')

    // A session id only exists in one profile's database, so the lookup must name it — otherwise
    // the server searches its own store, misses, and returns an empty transcript.
    expect(request).toHaveBeenCalledWith('session.resume', {
      cols: 80, omit_messages: true, profile: 'shopify', session_id: 'stored-7'
    })
    expect(get).toHaveBeenCalledWith(
      '/api/sessions/stored-7/messages?limit=120&order=latest&include_compacted=true&profile=shopify'
    )
    expect(resumed.messages).toHaveLength(1)
  })

  it('omits the profile parameter when none is selected', async () => {
    const request = vi.fn(async () => ({ session_id: 'runtime-8', stored_session_id: 'stored-8' }))
    const get = vi.fn(async () => new Response(JSON.stringify({ messages: [] })))

    await createMobileSessionClient({ request } as never, { get } as never).resume('stored-8')

    expect(request).toHaveBeenCalledWith('session.resume', {
      cols: 80, omit_messages: true, session_id: 'stored-8'
    })
    expect(get).toHaveBeenCalledWith(
      '/api/sessions/stored-8/messages?limit=120&order=latest&include_compacted=true'
    )
  })

  it('deletes a session inside the selected profile over REST', async () => {
    // REST, not WS session.delete: the WS method resolves through the gateway's in-memory table
    // (runtime ids) and refuses anything still held; the REST route takes the stored id directly.
    const remove = vi.fn(async () => new Response(JSON.stringify({ ok: true })))

    await createMobileSessionClient({} as never, { remove } as never).remove('stored-5', 'shopify')

    expect(remove).toHaveBeenCalledWith('/api/sessions/stored-5?profile=shopify')
  })

  it('omits the profile query when none is selected', async () => {
    const remove = vi.fn(async () => new Response(JSON.stringify({ ok: true })))

    await createMobileSessionClient({} as never, { remove } as never).remove('stored-6')

    expect(remove).toHaveBeenCalledWith('/api/sessions/stored-6')
  })

  it('treats an already-absent session as deleted', async () => {
    const remove = vi.fn(async () => new Response(JSON.stringify({ detail: 'not found' }), { status: 404 }))

    await expect(createMobileSessionClient({} as never, { remove } as never).remove('stored-7'))
      .resolves.toBeUndefined()
  })

  it('surfaces a delete the server refused', async () => {
    const remove = vi.fn(async () => new Response('', { status: 409 }))

    await expect(createMobileSessionClient({} as never, { remove } as never).remove('stored-8'))
      .rejects.toThrow('HTTP 409')
  })

  it('renames a session over REST and reports the title the server settled on', async () => {
    const patch = vi.fn(async () => new Response(JSON.stringify({ ok: true, title: 'Trip planning' })))

    await expect(createMobileSessionClient({} as never, { patch } as never).rename('stored-9', '  Trip planning  '))
      .resolves.toBe('Trip planning')
    expect(patch).toHaveBeenCalledWith('/api/sessions/stored-9', { title: 'Trip planning' })
  })

  it('sends the selected profile with a rename', async () => {
    const patch = vi.fn(async () => new Response(JSON.stringify({ ok: true, title: 'Work' })))

    await createMobileSessionClient({} as never, { patch } as never).rename('stored-10', 'Work', 'shopify')

    expect(patch).toHaveBeenCalledWith('/api/sessions/stored-10', { profile: 'shopify', title: 'Work' })
  })

  it('surfaces a rename the server refused', async () => {
    const patch = vi.fn(async () => new Response('', { status: 400 }))

    await expect(createMobileSessionClient({} as never, { patch } as never).rename('stored-11', 'x'))
      .rejects.toThrow('HTTP 400')
  })

  it('refuses to send a blank rename', async () => {
    const patch = vi.fn()

    await expect(createMobileSessionClient({} as never, { patch } as never).rename('stored-12', '   ')).rejects.toThrow()
    expect(patch).not.toHaveBeenCalled()
  })

})
