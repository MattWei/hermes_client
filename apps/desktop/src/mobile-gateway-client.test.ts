import { describe, expect, it, vi } from 'vitest'

import { connectMobileGateway } from './mobile-gateway-client'

class TestSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = TestSocket.CONNECTING
  readonly sent: Array<Record<string, unknown>> = []
  private readonly listeners = new Map<string, Array<(event: any) => void>>()

  addEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close(): void {
    this.readyState = TestSocket.CLOSED
    this.emit('close', { code: 1000 })
  }

  open(): void {
    this.readyState = TestSocket.OPEN
    this.emit('open', {})
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(candidate => candidate !== listener))
  }

  send(payload: string): void {
    const frame = JSON.parse(payload) as Record<string, unknown>
    this.sent.push(frame)
    if (frame.method === 'gateway.ping') {
      this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { ok: true } }) })
    }
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

describe('connectMobileGateway', () => {
  it('connects a LAN gateway and sends JSON-RPC ping using the static token', async () => {
    vi.stubGlobal('WebSocket', { OPEN: TestSocket.OPEN })
    const socket = new TestSocket()
    const openSocket = vi.fn(() => socket as unknown as WebSocket)

    const connecting = connectMobileGateway({
      baseUrl: 'http://10.10.10.10:9119',
      mode: 'lan',
      token: 'lan-token'
    }, openSocket)
    socket.open()
    const gateway = await connecting

    await expect(gateway.request('gateway.ping')).resolves.toEqual({ ok: true })
    expect(openSocket).toHaveBeenCalledWith('ws://10.10.10.10:9119/api/ws?token=lan-token')
    expect(socket.sent).toContainEqual(expect.objectContaining({ jsonrpc: '2.0', method: 'gateway.ping' }))

    gateway.close()
    vi.unstubAllGlobals()
  })

  it('connects to the adb-reverse loopback only when the emulator flag is explicit', async () => {
    vi.stubGlobal('WebSocket', { OPEN: TestSocket.OPEN })
    const socket = new TestSocket()
    const openSocket = vi.fn(() => socket as unknown as WebSocket)

    const connecting = connectMobileGateway({
      allowEmulatorLoopback: true,
      baseUrl: 'http://127.0.0.1:19130',
      mode: 'lan',
      token: 'lan-token'
    }, openSocket)
    socket.open()
    const gateway = await connecting

    expect(openSocket).toHaveBeenCalledWith('ws://127.0.0.1:19130/api/ws?token=lan-token')
    gateway.close()
    vi.unstubAllGlobals()
  })

  it('does not carry a LAN static token into a secure gateway dial', async () => {
    vi.stubGlobal('WebSocket', { OPEN: TestSocket.OPEN })
    const socket = new TestSocket()
    const openSocket = vi.fn(() => socket as unknown as WebSocket)

    const connecting = connectMobileGateway({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure',
      token: 'must-not-appear',
      ticket: 'one-time-ticket'
    }, openSocket)
    socket.open()
    const gateway = await connecting

    expect(openSocket).toHaveBeenCalledWith('wss://hermes.example.test/api/ws?ticket=one-time-ticket')
    gateway.close()
    vi.unstubAllGlobals()
  })
})
