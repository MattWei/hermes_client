import { describe, expect, it, vi } from 'vitest'

import { createMobilePromptClient } from './mobile-prompt-client'

describe('createMobilePromptClient', () => {
  it('submits text to the runtime session id', async () => {
    const request = vi.fn(async () => ({ status: 'accepted' }))
    const client = createMobilePromptClient({ on: vi.fn(), request })

    await client.submit('runtime-42', 'Hello from Android')

    expect(request).toHaveBeenCalledWith('prompt.submit', {
      session_id: 'runtime-42',
      text: 'Hello from Android'
    })
  })

  it('forwards only matching session delta and completion events', () => {
    let deltaHandler: ((event: any) => void) | undefined
    let completeHandler: ((event: any) => void) | undefined
    const on = vi.fn((type: string, handler: (event: any) => void) => {
      if (type === 'message.delta') deltaHandler = handler
      if (type === 'message.complete') completeHandler = handler
      return vi.fn()
    })
    const received: Array<{ complete: boolean, text: string }> = []
    const client = createMobilePromptClient({ on, request: vi.fn() })

    const unsubscribe = client.onStream('runtime-42', event => received.push(event))
    deltaHandler?.({ session_id: 'other-session', payload: { text: 'ignore' } })
    deltaHandler?.({ session_id: 'runtime-42', payload: { text: 'partial' } })
    completeHandler?.({ session_id: 'runtime-42', payload: { text: 'final' } })

    expect(received).toEqual([
      { complete: false, text: 'partial' },
      { complete: true, text: 'final' }
    ])
    unsubscribe()
  })
})
