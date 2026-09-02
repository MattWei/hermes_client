import { describe, expect, it, vi } from 'vitest'

import { createMobileApprovalClient } from './mobile-approval-client'

describe('createMobileApprovalClient', () => {
  it('forwards only the active session approval and responds with its request id', async () => {
    const handlers = new Map<string, (event: unknown) => void>()
    const request = vi.fn(async () => ({ resolved: true }))
    const client = createMobileApprovalClient({
      on: (type, handler) => { handlers.set(type, handler); return () => handlers.delete(type) },
      request
    })
    const seen = vi.fn()
    client.onRequest('runtime-1', seen)

    handlers.get('approval.request')?.({ session_id: 'other', payload: { request_id: 'other-request' } })
    handlers.get('approval.request')?.({ session_id: 'runtime-1', payload: { command: 'safe command', request_id: 'request-1' } })

    expect(seen).toHaveBeenCalledWith({ command: 'safe command', requestId: 'request-1' })
    await client.respond('runtime-1', 'request-1', 'once')
    expect(request).toHaveBeenCalledWith('approval.respond', { choice: 'once', request_id: 'request-1', session_id: 'runtime-1' })
  })

  it('sends deny with the original owning session and request id', async () => {
    const request = vi.fn(async () => ({ resolved: true }))
    const client = createMobileApprovalClient({ on: vi.fn(() => vi.fn()), request })

    await client.respond('runtime-2', 'request-2', 'deny')

    expect(request).toHaveBeenCalledWith('approval.respond', { choice: 'deny', request_id: 'request-2', session_id: 'runtime-2' })
  })
})
