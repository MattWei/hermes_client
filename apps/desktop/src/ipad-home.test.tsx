import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IpadHome } from './ipad-home'

describe('IpadHome', () => {
  it('shows the offline Hermes home without starting a backend', () => {
    render(<IpadHome />)

    expect(screen.getByRole('heading', { name: 'Hermes' })).toBeTruthy()
    expect(screen.getByText('MOBILE CLIENT · PREVIEW')).toBeTruthy()
    expect(screen.getByText('Backend not connected')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message composer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(true)
  })

  it('requires an explicit risk confirmation for a validated LAN connection', () => {
    render(<IpadHome />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.112.141.190:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'not-persisted' } })

    const validate = screen.getByRole('button', { name: 'Validate connection' })
    expect(validate.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    expect(validate.hasAttribute('disabled')).toBe(false)

    fireEvent.click(validate)
    expect(screen.getByText('LAN endpoint validated. Token has not been saved.')).toBeTruthy()
  })

  it('rejects a hostname in LAN mode', () => {
    render(<IpadHome />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://hermes-dashboard.local' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'not-persisted' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Validate connection' }))

    expect(screen.getByText('LAN connections require an RFC1918 IPv4 address')).toBeTruthy()
  })

  it('saves a validated LAN token through the supplied secure store', async () => {
    const saveLanSessionToken = vi.fn(async () => undefined)
    render(<IpadHome credentialStore={{
      clear: vi.fn(),
      read: vi.fn(),
      readLanSessionToken: vi.fn(),
      save: vi.fn(),
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
      clear: vi.fn(), read: vi.fn(), readLanSessionToken, save: vi.fn(), saveLanSessionToken: vi.fn()
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
    expect(screen.getAllByText('LAN gateway connected.')).toHaveLength(2)
    expect(screen.queryByText('Backend not connected')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy()
  })

  it('disconnects the active gateway and returns to the offline composer state', async () => {
    const close = vi.fn()
    render(<IpadHome credentialStore={{
      clear: vi.fn(), read: vi.fn(), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close, on: vi.fn(() => vi.fn()), request: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect gateway' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Connect LAN gateway' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect gateway' }))

    expect(close).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Connect LAN gateway' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Backend not connected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(true)
  })

  it('returns to the offline state when the gateway closes remotely', async () => {
    let onState: ((state: string) => void) | undefined
    render(<IpadHome credentialStore={{
      clear: vi.fn(), read: vi.fn(), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), onState: (handler: (state: string) => void) => { onState = handler; handler('open'); return vi.fn() }, request: vi.fn() }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(onState).toBeTruthy())

    act(() => onState?.('closed'))

    expect(screen.getByText('Backend not connected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(true)
  })

  it('loads the backend session list only after the user requests it', async () => {
    const connectGateway = vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request: vi.fn() }))
    const createRestClient = vi.fn(() => ({
      get: vi.fn(async () => new Response(JSON.stringify({
        sessions: [{ id: 'stored-1', preview: 'Existing preview', title: 'Existing chat' }]
      })))
    }))
    render(<IpadHome credentialStore={{
      clear: vi.fn(), read: vi.fn(), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={createRestClient} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }))
    await waitFor(() => expect(screen.getByText('Existing chat')).toBeTruthy())
    expect(screen.getByText('Existing preview')).toBeTruthy()
  })

  it('resumes a selected stored session and renders its Desktop-hydrated history', async () => {
    const request = vi.fn(async (method: string) => method === 'session.resume'
      ? { session_id: 'runtime-2', session_key: 'stored-2' }
      : { status: 'accepted' })
    const get = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sessions: [{ id: 'stored-2', preview: 'Existing preview', title: 'Existing chat' }]
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        messages: [
          { content: 'Earlier user message', role: 'user', timestamp: 1 },
          { content: 'Earlier reply', role: 'assistant', timestamp: 2 }
        ],
        session_id: 'stored-2'
      })))
    render(<IpadHome credentialStore={{
      clear: vi.fn(), read: vi.fn(), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={vi.fn(async () => ({ close: vi.fn(), on: vi.fn(() => vi.fn()), request }))} createRestClient={vi.fn(() => ({ get }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }))
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
      clear: vi.fn(), read: vi.fn(), readLanSessionToken: vi.fn(async () => 'stored-lan-token'), save: vi.fn(), saveLanSessionToken: vi.fn()
    }} connectGateway={connectGateway} createRestClient={vi.fn(() => ({ get }))} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Connection mode' }), { target: { value: 'lan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Backend address' }), { target: { value: 'http://10.10.10.10:9119' } })
    fireEvent.change(screen.getByLabelText('LAN session token'), { target: { value: 'token-to-save-first' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this LAN connection uses unencrypted HTTP and WS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect LAN gateway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start new session' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Start new session' }))
    await waitFor(() => expect(screen.getByText('Session runtime-42 created.')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Open New mobile chat' })).toBeTruthy()

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
})
