import { describe, expect, it, vi } from 'vitest'

import { openMobileGatewaySocket } from './mobile-gateway-transport'

describe('openMobileGatewaySocket', () => {
  it('opens a LAN socket with the explicitly provided static token', () => {
    const socket = {} as WebSocket
    const openSocket = vi.fn(() => socket)

    expect(openMobileGatewaySocket({
      baseUrl: 'http://10.112.141.190:9119',
      mode: 'lan',
      token: 'lan-token'
    }, openSocket)).toBe(socket)

    expect(openSocket).toHaveBeenCalledWith('ws://10.112.141.190:9119/api/ws?token=lan-token')
  })

  it('opens a secure socket with a one-time ticket instead of a LAN token', () => {
    const openSocket = vi.fn(() => ({} as WebSocket))

    openMobileGatewaySocket({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure',
      token: 'must-not-appear',
      ticket: 'one-time-ticket'
    }, openSocket)

    expect(openSocket).toHaveBeenCalledWith('wss://hermes.example.test/api/ws?ticket=one-time-ticket')
  })

  it('refuses a secure socket without a one-time ticket', () => {
    expect(() => openMobileGatewaySocket({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure'
    }, vi.fn())).toThrow('one-time ticket')
  })

  it('refuses a LAN socket without an explicit token', () => {
    expect(() => openMobileGatewaySocket({
      baseUrl: 'http://10.112.141.190:9119',
      mode: 'lan'
    }, vi.fn())).toThrow('session token')
  })
})
