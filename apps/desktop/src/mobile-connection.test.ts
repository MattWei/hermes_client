import { describe, expect, it } from 'vitest'

import { parseMobileConnection, toWebSocketUrl } from './mobile-connection'

describe('parseMobileConnection', () => {
  it('accepts an explicit HTTPS connection', () => {
    expect(parseMobileConnection('https://hermes.example.test', 'secure')).toEqual({
      baseUrl: 'https://hermes.example.test',
      mode: 'secure'
    })
  })

  it('accepts an explicit HTTP connection only for RFC1918 IPv4', () => {
    expect(parseMobileConnection('http://10.112.141.190:9119', 'lan')).toEqual({
      baseUrl: 'http://10.112.141.190:9119',
      mode: 'lan'
    })
  })

  it.each([
    'http://hermes-dashboard.local',
    'http://127.0.0.1:9119',
    'http://172.15.0.1',
    'http://172.32.0.1',
    'http://192.169.0.1',
    'http://8.8.8.8',
    'http://[fd00::1]'
  ])('rejects an unsafe LAN address: %s', url => {
    expect(() => parseMobileConnection(url, 'lan')).toThrow('RFC1918 IPv4')
  })

  it('permits only exact IPv4 loopback when the emulator-only flag is explicit', () => {
    expect(parseMobileConnection('http://127.0.0.1:19119', 'lan', { allowEmulatorLoopback: true })).toEqual({
      baseUrl: 'http://127.0.0.1:19119',
      mode: 'lan'
    })
    expect(() => parseMobileConnection('http://127.0.0.2:19119', 'lan', { allowEmulatorLoopback: true })).toThrow('RFC1918 IPv4')
  })

  it('does not accept HTTP in secure mode or HTTPS in LAN mode', () => {
    expect(() => parseMobileConnection('http://10.112.141.190', 'secure')).toThrow('HTTPS')
    expect(() => parseMobileConnection('https://10.112.141.190', 'lan')).toThrow('HTTP')
  })
})

describe('toWebSocketUrl', () => {
  it('maps each configured transport without a downgrade fallback', () => {
    expect(toWebSocketUrl('https://hermes.example.test', 'secure')).toBe('wss://hermes.example.test/api/ws')
    expect(toWebSocketUrl('http://10.112.141.190:9119', 'lan')).toBe('ws://10.112.141.190:9119/api/ws')
  })
})
