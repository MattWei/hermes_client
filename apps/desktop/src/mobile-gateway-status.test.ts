import { describe, expect, it } from 'vitest'

import { gatewayHostLabel, readGatewayStatus } from './mobile-gateway-status'

describe('readGatewayStatus', () => {
  it('reports a running gateway as ready', () => {
    expect(readGatewayStatus({ gateway_running: true, gateway_state: 'running' }))
      .toEqual({ label: 'Backend ready', tone: 'ok' })
  })

  it('ignores every platform: this footer is about the backend being connected, nothing else', () => {
    // A messaging adapter failing to start says nothing about the gateway serving this client.
    expect(readGatewayStatus({
      gateway_platforms: { weixin: { needs_attention: true, state: 'fatal' } },
      gateway_running: true,
      gateway_state: 'running'
    })).toEqual({ label: 'Backend ready', tone: 'ok' })
  })

  it('makes a stopped gateway the headline', () => {
    expect(readGatewayStatus({ gateway_running: false, gateway_state: 'stopped' }))
      .toEqual({ label: 'Backend stopped', tone: 'warn' })
    expect(readGatewayStatus({ gateway_running: false, gateway_state: 'crashed' }))
      .toEqual({ label: 'Backend crashed', tone: 'warn' })
  })

  it('claims nothing it cannot stand behind', () => {
    // No gateway_running at all: not evidence of anything, so the footer shows the host alone.
    expect(readGatewayStatus(null)).toEqual({ label: '', tone: 'ok' })
    expect(readGatewayStatus({ sessions: [] })).toEqual({ label: '', tone: 'ok' })
  })
})

describe('gatewayHostLabel', () => {
  it('shows the host a person recognises', () => {
    expect(gatewayHostLabel('https://api.wei-agent.com')).toBe('api.wei-agent.com')
    expect(gatewayHostLabel('http://192.168.1.10:9119/')).toBe('192.168.1.10:9119')
    expect(gatewayHostLabel('')).toBe('')
  })

  it('falls back to stripping the scheme when the address is not a valid URL', () => {
    expect(gatewayHostLabel('not a url')).toBe('not a url')
  })
})
