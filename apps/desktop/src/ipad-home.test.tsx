import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IpadHome } from './ipad-home'
import { deferred } from './test/deferred'

describe('IpadHome', () => {
  it('shows the offline Hermes home without starting a backend', () => {
    render(<IpadHome />)

    // The disconnected page is the connection form only: no brand block, no promo copy, no
    // status chip — the form carries its own status line.
    expect(screen.getByRole('combobox', { name: 'Connection mode' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Backend address' })).toBeTruthy()
    expect(screen.queryByText('Backend not connected')).toBeNull()
    // The disconnected page deliberately carries no composer: it could only render disabled
    // beneath a "Create a session to start a conversation" placeholder, while the control that
    // creates a session lives in the sidebar that appears *after* connecting.
    expect(screen.queryByRole('textbox', { name: 'Message composer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
  })

  it('requires an explicit risk confirmation before a LAN probe is allowed', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/api/status') {
        return new Response(JSON.stringify({ version: '1.2.3' }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })
    render(<IpadHome createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.112.141.190:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'not-persisted' } })

    const validate = screen.getByRole('button', { name: 'Validate' })
    expect(validate.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    expect(validate.hasAttribute('disabled')).toBe(false)

    fireEvent.click(validate)
    await waitFor(() => expect(screen.getByText(/LAN gateway reachable \(Hermes 1\.2\.3\)/)).toBeTruthy())
    // the probe must actually reach the gateway, not just parse the address
    expect(get).toHaveBeenCalledWith('/api/status')
  })

  it('rejects a hostname in LAN mode', () => {
    render(<IpadHome />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://hermes-dashboard.local' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'not-persisted' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    expect(screen.getByText('LAN connections require an RFC1918 IPv4 address')).toBeTruthy()
  })

  it('saves a validated LAN token through the supplied secure store', async () => {
    const saveLanSessionToken = vi.fn(async () => undefined)
    render(<IpadHome credentialStore={{
      clear: vi.fn(),
      clearAutoLogin: vi.fn(),
      read: vi.fn(),
      readAutoLogin: vi.fn(async () => null),
      readLanSessionToken: vi.fn(),
      save: vi.fn(),
      saveAutoLogin: vi.fn(),
      saveLanSessionToken
    }} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.112.141.190:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'native-only' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save LAN token' }))

    await waitFor(() => expect(saveLanSessionToken).toHaveBeenCalledWith('native-only'))
    expect(screen.getByText('LAN token saved to secure device storage.')).toBeTruthy()
  })

  it('reads the saved LAN token and connects only through the supplied gateway adapter', async () => {
    const readLanSessionToken = vi.fn(async () => 'stored-lan-token')
    const connectGateway = vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken, save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))

    await waitFor(() => expect(connectGateway).toHaveBeenCalledWith({
      baseUrl: 'http://10.10.10.10:9119', mode: 'lan', token: 'stored-lan-token'
    }))
    expect(readLanSessionToken).toHaveBeenCalledOnce()
    expect(screen.getAllByText('LAN gateway connected.')).toHaveLength(1)
    expect(screen.queryByText('Backend not connected')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy()
  })

  it('disconnects the active gateway and returns to the offline state', async () => {
    const close = vi.fn()
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close, on: vi.fn(() => vi.fn()), request: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'logout' })).toBeTruthy())
    // While connected the connection form is put away, not merely disabled.
    expect(screen.queryByRole('button', { name: 'Connect LAN gateway' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Connection mode' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))

    expect(close).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Connect LAN gateway' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Gateway disconnected.')).toBeTruthy()
    // No composer on the disconnected page, so there is no Send button to disable.
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
  })

  it('returns to the offline state when the gateway closes remotely', async () => {
    let onState: ((state: string) => void) | undefined
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), onState: (handler: (state: string) => void) => { onState = handler; handler('open'); return vi.fn() }, request: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(onState).toBeTruthy())

    act(() => onState?.('closed'))

    expect(screen.getByText('Gateway connection lost.')).toBeTruthy()
    // No composer on the disconnected page, so there is no Send button to disable.
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
  })

  it('loads the backend session list automatically once the gateway connects', async () => {
    const connectGateway = vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))
    const createRestClient = vi.fn(() => ({
      get: vi.fn(async () => new Response(JSON.stringify({
        sessions: [{ id: 'stored-1', preview: 'Existing preview', title: 'Existing chat' }]
      }))),
      patch: vi.fn(),
      post: vi.fn(),
      remove: vi.fn()
    }))
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={createRestClient} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    // No manual refresh: the list arrives because the gateway connected.
    await waitFor(() => expect(screen.getByText('Existing chat')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeTruthy()
    // the session actions live in the sidebar; the inset header is the title bar
    expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy()
    expect(screen.getByText('No session selected')).toBeTruthy()
  })

  it('resumes a selected stored session and renders its Desktop-hydrated history', async () => {
    const request = vi.fn(async (method: string) => method === 'session.resume'
      ? { session_id: 'runtime-2', session_key: 'stored-2' }
      : { status: 'accepted' })
    const get = vi.fn(async (path: string) => {
      // Profile discovery must not consume a queued response meant for another path.
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      if (path.includes('/messages')) {
        return new Response(JSON.stringify({
          messages: [
            { content: 'Earlier user message', role: 'user', timestamp: 1 },
            { content: 'Earlier reply', role: 'assistant', timestamp: 2 }
          ],
          session_id: 'stored-2'
        }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-2', preview: 'Existing preview', title: 'Existing chat' }]
      }))
    })
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Existing chat' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Open Existing chat' }))
    await waitFor(() => expect(screen.getByText('Earlier reply')).toBeTruthy())
    expect(request).toHaveBeenCalledWith('session.resume', { cols: 80, omit_messages: true, session_id: 'stored-2' })
    expect(screen.getByRole('textbox', { name: 'Message composer' }).hasAttribute('disabled')).toBe(false)
  })

  it('creates a session then submits and renders its scoped streamed reply', async () => {
    const handlers = new Map<string, (event: unknown) => void>()
    const request = vi.fn(async (method: string) => {
      if (method === 'session.create') {
        return { session_id: 'runtime-42', stored_session_id: 'stored-42' }
      }
      return { status: 'accepted' }
    })
    const connectGateway = vi.fn(async () => ({
      close: vi.fn(),
      on: (type: string, handler: (event: unknown) => void) => {
        handlers.set(type, handler)
        return () => handlers.delete(type)
      },
      request
    }))
    const get = vi.fn(async () => new Response(JSON.stringify({
      messages: [{ content: 'Recovered history', role: 'assistant', timestamp: 3 }]
    })))
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await waitFor(() => expect(screen.getByText('Session runtime-42 created.')).toBeTruthy())
    // A freshly created session opens straight into the inset.
    expect(screen.queryByText('Select a session, or start a new one.')).toBeNull()

    const composer = screen.getByRole('textbox', { name: 'Message composer' })
    expect(composer.hasAttribute('disabled')).toBe(false)
    fireEvent.change(composer, { target: { value: 'Hello from Android' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('prompt.submit', { session_id: 'runtime-42', text: 'Hello from Android' }))
    expect(screen.getByText('Hello from Android')).toBeTruthy()

    await waitFor(() => expect(handlers.has('message.delta')).toBe(true))
    act(() => handlers.get('message.delta')?.({ session_id: 'runtime-42', payload: { text: 'Partial reply' } }))
    expect(screen.getByText('Partial reply')).toBeTruthy()
    act(() => handlers.get('message.complete')?.({ session_id: 'runtime-42', payload: { text: 'Final reply' } }))
    expect(screen.getByText('Final reply')).toBeTruthy()
    expect(screen.queryByText('Partial reply')).toBeNull()

    await waitFor(() => expect(handlers.has('session.replay.gap')).toBe(true))
    act(() => handlers.get('session.replay.gap')?.({ session_id: 'runtime-42' }))
    await waitFor(() => expect(screen.getByText('Recovered history')).toBeTruthy())
    expect(screen.queryByText('Final reply')).toBeNull()

    await waitFor(() => expect(handlers.has('approval.request')).toBe(true))
    act(() => handlers.get('approval.request')?.({ session_id: 'runtime-42', payload: { command: 'safe command', request_id: 'approval-1' } }))
    await waitFor(() => expect(screen.getByText('safe command')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('approval.respond', { choice: 'once', request_id: 'approval-1', session_id: 'runtime-42' }))

    await waitFor(() => expect(handlers.has('tool.start')).toBe(true))
    act(() => handlers.get('tool.start')?.({ session_id: 'other-session', payload: { name: 'ignored', tool_id: 'tool-other' } }))
    act(() => handlers.get('tool.start')?.({ session_id: 'runtime-42', payload: { name: 'terminal', tool_id: 'tool-1' } }))
    expect(screen.getByText('terminal · running')).toBeTruthy()
    expect(screen.queryByText('ignored · running')).toBeNull()
    act(() => handlers.get('tool.complete')?.({ session_id: 'runtime-42', payload: { name: 'terminal', tool_id: 'tool-1' } }))
    expect(screen.getByText('terminal · complete')).toBeTruthy()
  })

  it('searches the session list and splits it into date groups', async () => {
    const now = Date.now() / 1000
    const longAgo = now - 60 * 60 * 24 * 45
    const createRestClient = vi.fn(() => ({
      get: vi.fn(async () => new Response(JSON.stringify({
        sessions: [
          { id: 'stored-new', last_active: now, preview: 'Recent preview', title: 'Recent chat' },
          { id: 'stored-old', last_active: longAgo, preview: 'Old preview', title: 'Ancient chat' }
        ]
      }))),
      patch: vi.fn(),
      post: vi.fn(),
      remove: vi.fn()
    }))
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={createRestClient} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))

    await waitFor(() => expect(screen.getByText('Recent chat')).toBeTruthy())
    expect(screen.getByText('Ancient chat')).toBeTruthy()

    // two very different ages belong to different calendar buckets, so the list gains headings
    const headingsBefore = document.querySelectorAll('[data-slot="sidebar-group-label"]').length

    // the search box narrows the list to the non-matching session being filtered out
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'ancient' } })
    await waitFor(() => expect(screen.queryByText('Recent chat')).toBeNull())
    expect(screen.getByText('Ancient chat')).toBeTruthy()

    // clearing restores both rows
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: '' } })
    await waitFor(() => expect(screen.getByText('Recent chat')).toBeTruthy())
    expect(headingsBefore).toBeGreaterThanOrEqual(1)
  })

  it('keeps the session list in the sidebar while a session is open', async () => {
    const request = vi.fn(async (method: string) => method === 'session.resume'
      ? { session_id: 'runtime-2', session_key: 'stored-2' }
      : { status: 'accepted' })
    const get = vi.fn(async (path: string) => {
      // Profile discovery must not consume a queued response meant for another path.
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      if (path.includes('/messages')) {
        return new Response(JSON.stringify({
          messages: [{ content: 'Earlier reply', role: 'assistant', timestamp: 1 }],
          session_id: 'stored-2'
        }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-2', preview: 'Existing preview', title: 'Existing chat' }]
      }))
    })
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))

    // the session list is the sidebar
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Existing chat' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeTruthy()

    // opening a session renders it in the inset
    fireEvent.click(screen.getByRole('button', { name: 'Open Existing chat' }))
    await waitFor(() => expect(screen.getByText('Earlier reply')).toBeTruthy())

    // the list stays put — no back navigation needed, and the gateway survives
    expect(screen.getByRole('button', { name: 'Open Existing chat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'logout' })).toBeTruthy()
    expect(screen.queryByText('Backend not connected')).toBeNull()
  })

  it('shows a loading state while a session opens, then the transcript', async () => {
    const resumeGate = deferred()
    const request = vi.fn(async (method: string) => {
      if (method === 'session.resume') {
        await resumeGate.promise
        return { session_id: 'runtime-3', session_key: 'stored-3' }
      }
      return { status: 'accepted' }
    })
    const get = vi.fn(async (path: string) => {
      // Profile discovery must not consume a queued response meant for another path.
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      if (path.includes('/messages')) {
        return new Response(JSON.stringify({
          messages: [{ content: 'Earlier reply', role: 'assistant', timestamp: 1 }],
          session_id: 'stored-3'
        }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-3', preview: 'Existing preview', title: 'Existing chat' }]
      }))
    })
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Existing chat' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Open Existing chat' }))

    // the tap has an immediate, visible effect while the resume is in flight
    expect(screen.getByRole('status').textContent).toBe('Loading session…')

    resumeGate.resolve()
    await waitFor(() => expect(screen.getByText('Earlier reply')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('signs in to a remote gateway and connects with the minted ticket', async () => {
    const post = vi.fn(async (path: string) => {
      if (path === '/auth/password-login') {
        return new Response(JSON.stringify({ next: '/', ok: true }))
      }
      if (path === '/api/auth/ws-ticket') {
        return new Response(JSON.stringify({ ticket: 'one-shot', ttl_seconds: 30 }))
      }
      throw new Error(`unexpected POST ${path}`)
    })
    const get = vi.fn(async (path: string) => {
      if (path === '/api/auth/providers') {
        return new Response(JSON.stringify({
          providers: [
            { display_name: 'Username & Password', name: 'basic', supports_password: true },
            { display_name: 'Nous Portal', name: 'nous', supports_password: false }
          ]
        }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })
    const createRestClient = vi.fn(() => ({ get, patch: vi.fn(), post, remove: vi.fn() }))
    const connectGateway = vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={createRestClient} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'https://gateway.example.test' } })
    fireEvent.change(screen.getByLabelText('Remote username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Remote password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.getByText('Remote gateway connected.')).toBeTruthy())
    // the password provider wins even though another provider is listed first-and-excluded
    expect(post).toHaveBeenCalledWith('/auth/password-login', {
      password: 'secret',
      provider: 'basic',
      username: 'alice'
    })
    // the ticket is what makes the socket reachable; the URL alone would be refused
    expect(connectGateway).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://gateway.example.test',
      mode: 'secure',
      ticket: 'one-shot'
    }))
    expect(screen.queryByLabelText('Remote username')).toBeNull()
  })

  it('reports a rejected sign-in without connecting', async () => {
    const post = vi.fn(async (path: string) => {
      if (path === '/auth/password-login') {
        return new Response(JSON.stringify({ detail: 'Invalid credentials' }), { status: 401 })
      }
      throw new Error(`unexpected POST ${path}`)
    })
    const get = vi.fn(async () => new Response(JSON.stringify({
      providers: [{ display_name: 'Username & Password', name: 'basic', supports_password: true }]
    })))
    const connectGateway = vi.fn()

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={vi.fn(() => ({ get, post, patch: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'https://gateway.example.test' } })
    fireEvent.change(screen.getByLabelText('Remote username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Remote password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.getByText('Invalid username or password')).toBeTruthy())
    expect(connectGateway).not.toHaveBeenCalled()
    // the form stays so the credential can be corrected
    expect(screen.getByLabelText('Remote username')).toBeTruthy()
  })

  it('reveals and re-hides the password without losing what was typed', () => {
    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn()} createRestClient={vi.fn(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByLabelText('Remote password'), { target: { value: 'secret' } })
    expect(screen.getByLabelText('Remote password').getAttribute('type')).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Remote password').getAttribute('type')).toBe('text')
    // the reveal must not clear the field — the value is what gets submitted
    expect((screen.getByLabelText('Remote password') as HTMLInputElement).value).toBe('secret')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Remote password').getAttribute('type')).toBe('password')
    expect((screen.getByLabelText('Remote password') as HTMLInputElement).value).toBe('secret')
  })

  it('reports an unreachable endpoint instead of claiming validation', async () => {
    const get = vi.fn(async () => {
      throw new Error('Network request failed')
    })
    render(<IpadHome createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'https://gateway.example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(screen.getByText('Network request failed')).toBeTruthy())
    // the regression this guards: a well-formed but unreachable address must never read as valid
    expect(screen.queryByText(/validated/i)).toBeNull()
  })

  it('rejects an address that is reachable but is not a Hermes gateway', async () => {
    const get = vi.fn(async () => new Response(JSON.stringify({ hello: 'world' })))
    render(<IpadHome createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'https://gateway.example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(
      screen.getByText('Reached that address, but it is not a Hermes gateway')
    ).toBeTruthy())
  })

  it('surfaces a rejected LAN token rather than a healthy endpoint', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/api/status') {
        return new Response(JSON.stringify({ version: '1.2.3' }))
      }
      return new Response(JSON.stringify({ detail: 'nope' }), { status: 401 })
    })
    render(<IpadHome createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.112.141.190:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'stale-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(
      screen.getByText('The gateway is reachable, but it rejected the LAN token')
    ).toBeTruthy())
  })

  it('stores the credential only when auto-login is ticked', async () => {
    const saveAutoLogin = vi.fn(async () => undefined)
    const clearAutoLogin = vi.fn(async () => undefined)
    const connectGateway = vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))
    const get = vi.fn(async (path: string) => {
      if (path === '/api/auth/providers') {
        return new Response(JSON.stringify({
          providers: [{ display_name: 'Username & Password', name: 'basic', supports_password: true }]
        }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })
    const post = vi.fn(async (path: string) => {
      if (path === '/auth/password-login') {
        return new Response(JSON.stringify({ next: '/', ok: true }))
      }
      return new Response(JSON.stringify({ ticket: 'one-shot', ttl_seconds: 30 }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin, read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(), save: vi.fn(), saveAutoLogin, saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={vi.fn(() => ({ get, post, patch: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'https://gateway.example.test' } })
    fireEvent.change(screen.getByLabelText('Remote username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Remote password'), { target: { value: 'secret' } })
    // Drive the change event directly: a controlled checkbox toggled by fireEvent.click flips the
    // DOM's checked flag without necessarily reaching React's onChange, which makes the assertion
    // below pass while the component state never updates.
    fireEvent.click(screen.getByLabelText('Sign in automatically next time'))
    // Re-query after a render tick: reading the stale reference would show the DOM flag jsdom set
    // from the click, which is true even when React's onChange never ran and the state is still false.
    await waitFor(() => expect(
      (screen.getByLabelText('Sign in automatically next time') as HTMLInputElement).checked
    ).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(saveAutoLogin).toHaveBeenCalledWith({
      baseUrl: 'https://gateway.example.test',
      password: 'secret',
      username: 'alice'
    }))
    expect(clearAutoLogin).not.toHaveBeenCalled()
  })

  it('drops the stored credential when auto-login is left unticked', async () => {
    const clearAutoLogin = vi.fn(async () => undefined)
    const get = vi.fn(async (path: string) => {
      if (path === '/api/auth/providers') {
        return new Response(JSON.stringify({ providers: [{ name: 'basic', supports_password: true }] }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })
    const post = vi.fn(async (path: string) => {
      if (path === '/auth/password-login') {
        return new Response(JSON.stringify({ ok: true }))
      }
      return new Response(JSON.stringify({ ticket: 'one-shot', ttl_seconds: 30 }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin, read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, post, patch: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'https://gateway.example.test' } })
    fireEvent.change(screen.getByLabelText('Remote username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Remote password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(clearAutoLogin).toHaveBeenCalled())
  })

  it('signs in on launch from the stored credential without any interaction', async () => {
    const readAutoLogin = vi.fn(async () => ({
      baseUrl: 'https://gateway.example.test',
      password: 'secret',
      username: 'alice'
    }))
    const connectGateway = vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))
    const get = vi.fn(async (path: string) => {
      if (path === '/api/auth/providers') {
        return new Response(JSON.stringify({ providers: [{ name: 'basic', supports_password: true }] }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })
    const post = vi.fn(async (path: string) => {
      if (path === '/auth/password-login') {
        return new Response(JSON.stringify({ ok: true }))
      }
      return new Response(JSON.stringify({ ticket: 'auto-ticket', ttl_seconds: 30 }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin, readLanSessionToken: vi.fn(), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={vi.fn(() => ({ get, post, patch: vi.fn(), remove: vi.fn() }))} />)

    // no clicks at all: the launch pass has to carry the whole sign-in
    await waitFor(() => expect(connectGateway).toHaveBeenCalledWith(
      expect.objectContaining({ ticket: 'auto-ticket' })
    ))
    expect(post).toHaveBeenCalledWith('/auth/password-login', {
      password: 'secret',
      provider: 'basic',
      username: 'alice'
    })
  })

  it('reuses an untouched session instead of minting another one', async () => {
    let createCount = 0
    const request = vi.fn(async (method: string) => {
      if (method === 'session.create') {
        createCount += 1
        return { session_id: `runtime-${createCount}`, stored_session_id: `stored-${createCount}` }
      }
      return {}
    })
    const get = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })))

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await waitFor(() => expect(createCount).toBe(1))

    // Pressing it again while the session has no messages must not mint a second runtime session:
    // the backend persists neither, so all it would produce is another duplicate local row.
    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await act(async () => { await Promise.resolve() })
    expect(createCount).toBe(1)
    // A session with no turns has no backend row, so the list must not carry one: claiming it
    // exists is what produced the growing pile of identical "New mobile chat" entries.
    expect(screen.queryByRole('button', { name: 'Open New mobile chat' })).toBeNull()
  })

  it('mints a new session once the current one has been used', async () => {
    let createCount = 0
    const request = vi.fn(async (method: string) => {
      if (method === 'session.create') {
        createCount += 1
        return { session_id: `runtime-${createCount}`, stored_session_id: `stored-${createCount}` }
      }
      return {}
    })
    const get = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })))

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await waitFor(() => expect(createCount).toBe(1))

    // Type into the draft, which is what makes it worth keeping.
    fireEvent.change(screen.getByRole('textbox', { name: 'Message composer' }), { target: { value: 'hello' } })

    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await waitFor(() => expect(createCount).toBe(2))
  })

  it('adds the session to the list only after the first turn reaches the backend', async () => {
    let sent = false
    const request = vi.fn(async (method: string) => {
      if (method === 'session.create') {
        return { session_id: 'runtime-1', stored_session_id: 'stored-1' }
      }
      return {}
    })
    const get = vi.fn(async (path: string) => {
      // mirrors the backend: the row exists only once a turn has been persisted
      if (path.startsWith('/api/sessions') && sent) {
        return new Response(JSON.stringify({
          sessions: [{ id: 'stored-1', last_active: Date.now() / 1000, preview: 'hello', title: 'hello' }]
        }))
      }
      return new Response(JSON.stringify({ sessions: [] }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message composer' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Open New mobile chat' })).toBeNull()

    sent = true
    fireEvent.change(screen.getByRole('textbox', { name: 'Message composer' }), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    // the list is refreshed from the server, so the row appears as a consequence of the turn
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open hello' })).toBeTruthy())
  })

  it('re-homes the session list when the profile changes', async () => {
    const requested: string[] = []
    const get = vi.fn(async (path: string) => {
      requested.push(path)
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({
          profiles: [
            { display_name: '', is_default: true, name: 'default' },
            { display_name: '', is_default: false, name: 'work' }
          ]
        }))
      }
      if (path.includes('profile=work')) {
        return new Response(JSON.stringify({
          sessions: [{ id: 'stored-w', preview: 'From work', title: 'Work chat' }]
        }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-d', preview: 'From default', title: 'Default chat' }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Default chat' })).toBeTruthy())

    // Two profiles are available, so the selector appears.
    fireEvent.change(screen.getByLabelText('Profile'), { target: { value: 'work' } })

    // Sessions live in per-profile stores, so the list must be re-read with the profile named —
    // filtering the already-loaded rows locally would show the wrong set.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Work chat' })).toBeTruthy())
    expect(requested.some(path => path.includes('/api/sessions') && path.includes('profile=work'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Open Default chat' })).toBeNull()
  })

  it('labels a session by its preview when the backend never auto-titled it', async () => {
    // Auto-titling only happens after a complete exchange, so most sessions arrive with a preview
    // and no title. Falling straight to "Untitled session" would make the list unreadable.
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-9', preview: 'Explain the openspec change', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Explain the openspec change' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Open Untitled session' })).toBeNull()
  })

  it('adopts the gateway default profile and loads that store on connect', async () => {
    const requested: string[] = []
    const get = vi.fn(async (path: string) => {
      requested.push(path)
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({
          profiles: [
            { display_name: '', is_default: false, name: 'shopify' },
            { display_name: '', is_default: true, name: 'default' }
          ]
        }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-1', preview: 'Default store chat', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Default store chat' })).toBeTruthy())
    // The selection must be a real profile name, not an empty value that matches no option.
    expect(screen.getByLabelText('Profile')).toHaveProperty('value', 'default')
    expect(requested.some(path => path.includes('profile=default'))).toBe(true)
    expect(screen.queryByRole('option', { name: 'Default' })).toBeNull()
  })

  it('deletes a session from the long-press menu', async () => {
    const remove = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    const request = vi.fn(async () => ({}))
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-4', preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    // Nothing is shown until the row is long-pressed. The press is timed from pointer events
    // because WKWebView does not deliver contextmenu for a long press on an ordinary element.
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open Trip planning' }), { pointerType: 'touch' })
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy())

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith('/api/sessions/stored-4'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renames a session from the long-press menu', async () => {
    const patch = vi.fn(async () => new Response(JSON.stringify({ ok: true, title: 'Trip planning' })))
    const request = vi.fn(async () => ({}))
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-5', preview: 'old name', title: 'Old name' }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get, patch, post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Old name' })).toBeTruthy())

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open Old name' }), { pointerType: 'touch' })
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

    // Rename swaps the row for an input: WKWebView does not present window.prompt().
    const field = screen.getByLabelText('New session title')
    fireEvent.change(field, { target: { value: 'Trip planning' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/sessions/stored-5', { title: 'Trip planning' }))
  })

  it('shows a pinned session in its own group above the dated ones', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [
          { id: 'pinned-1', pinned: true, preview: 'Kept around', title: null },
          { id: 'plain-1', preview: 'Ordinary chat', title: null }
        ]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))

    await waitFor(() => expect(screen.getByText('Pinned')).toBeTruthy())
    // A pinned row belongs to the Pinned group only — never listed twice.
    expect(screen.getAllByRole('button', { name: 'Open Kept around' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open Ordinary chat' })).toBeTruthy()
  })

  it('pins a session from the action sheet', async () => {
    const patchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true, pinned: true })))
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-30', pinned: false, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: patchFn, post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    // The sheet is also reachable from a visible trigger, not only the long press.
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Trip planning' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))

    await waitFor(() => expect(patchFn).toHaveBeenCalledWith('/api/sessions/stored-30', { pinned: true }))
  })

  it('dismisses the action sheet when pressing outside it', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-40', pinned: false, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Trip planning' }))
    expect(screen.getByRole('menu')).toBeTruthy()

    // Anywhere outside closes it, not only another row.
    fireEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('keeps the action sheet open when pressing inside it', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-41', pinned: false, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Trip planning' }))
    // Clicking the sheet itself (not one of its items, which would run the action) must not dismiss.
    fireEvent.click(screen.getByRole('menu'))

    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('closes the sheet on a second long press of the same row', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-50', pinned: false, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: vi.fn(), post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    const row = screen.getByRole('button', { name: 'Open Trip planning' })
    fireEvent.pointerDown(row, { pointerType: 'touch' })
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy())

    // Pressing the same row again toggles it shut. Dismissal listens for `click`, which a long
    // press suppresses, so the two never fight over the same gesture.
    fireEvent.pointerDown(row, { pointerType: 'touch' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('moves a session into Pinned as soon as it is tapped, before the server answers', async () => {
    const pendingResolvers: Array<(value: Response) => void> = []
    const PATCH = vi.fn(() => new Promise<Response>(resolve => { pendingResolvers.push(resolve) }))

    window.localStorage.clear()

    // The list reflects whatever the server currently holds, so a pin that lands changes what the
    // follow-up refresh reports — otherwise the refresh would overwrite the optimistic row.
    const serverPinned = { value: false }
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-60', pinned: serverPinned.value, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: PATCH, post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Trip planning' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))

    // The request has not resolved, yet the row is already under Pinned.
    await waitFor(() => expect(screen.getByText('Pinned')).toBeTruthy())

    pendingResolvers.forEach(resolve => resolve(new Response(JSON.stringify({ ok: true, pinned: true }))))
  })

  it('writes the pin to the local cache so a relaunch paints it again', async () => {
    const PATCH = vi.fn(async () => {
      serverPinned.value = true
      return new Response(JSON.stringify({ ok: true, pinned: true }))
    })

    window.localStorage.clear()

    // The list reflects whatever the server currently holds, so a pin that lands changes what the
    // follow-up refresh reports — otherwise the refresh would overwrite the optimistic row.
    const serverPinned = { value: false }
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-60', pinned: serverPinned.value, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: PATCH, post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Trip planning' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))

    await waitFor(() => expect(PATCH).toHaveBeenCalled())
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('hermes.mobile.pinned.default') ?? '[]'))
      .toContain('stored-60'))
  })

  it('rolls a failed pin back out of the list', async () => {
    const PATCH = vi.fn(async () => new Response('', { status: 500 }))

    window.localStorage.clear()

    // The list reflects whatever the server currently holds, so a pin that lands changes what the
    // follow-up refresh reports — otherwise the refresh would overwrite the optimistic row.
    const serverPinned = { value: false }
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [{ id: 'stored-60', pinned: serverPinned.value, preview: 'Trip planning', title: null }]
      }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: PATCH, post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Trip planning' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))

    // Painted optimistically, then reverted when the write was refused.
    await waitFor(() => expect(screen.queryByText('Pinned')).toBeNull())
    expect(screen.getByRole('button', { name: 'Open Trip planning' })).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('hermes.mobile.pinned.default') ?? '[]')).not.toContain('stored-60')
  })

  it('leaves only the open session marked active after an unpin reorders the list', async () => {
    // The menu button paints its focus ring with the same background as the active row, so a focus
    // retained across the reorder reads as a second row being selected.
    const serverPinned = { value: true }
    const get = vi.fn(async (path: string) => {
      if (path === '/api/profiles') {
        return new Response(JSON.stringify({ profiles: [] }))
      }
      return new Response(JSON.stringify({
        sessions: [
          { id: 'stored-70', pinned: serverPinned.value, preview: 'Pinned chat', title: null },
          { id: 'stored-71', pinned: false, preview: 'Ordinary chat', title: null }
        ]
      }))
    })
    const patchFn = vi.fn(async () => {
      serverPinned.value = false
      return new Response(JSON.stringify({ ok: true, pinned: false }))
    })

    render(<IpadHome credentialStore={{
      clear: vi.fn(), clearAutoLogin: vi.fn(), read: vi.fn(), readAutoLogin: vi.fn(async () => null), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveAutoLogin: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))} createRestClient={vi.fn(() => ({ get, patch: patchFn, post: vi.fn(), remove: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'lan-token' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Pinned chat' })).toBeTruthy())

    // Nothing is open, so nothing is active to begin with.
    const active = () => document.querySelectorAll('[data-slot="sidebar-menu-button"][data-active="true"]')
    expect(active()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Pinned chat' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin' }))

    // After the reorder the row is still not the open session, so it must not be marked active.
    await waitFor(() => expect(patchFn).toHaveBeenCalled())
    expect(active()).toHaveLength(0)
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-slot')).not.toBe('sidebar-menu-button')
  })

})
