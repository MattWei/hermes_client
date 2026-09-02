import { describe, expect, it, vi } from 'vitest'

import { createMobileToolActivityClient } from './mobile-tool-activity-client'

describe('createMobileToolActivityClient', () => {
  it('tracks only the active session tool lifecycle', () => {
    const handlers = new Map<string, (event: unknown) => void>()

    const client = createMobileToolActivityClient({
      on: (type, handler) => {
        handlers.set(type, handler)

        return () => handlers.delete(type)
      }
    })

    const seen = vi.fn()
    client.onActivity('runtime-1', seen)
    handlers.get('tool.start')?.({ session_id: 'other', payload: { name: 'ignored', tool_id: 'other' } })
    handlers.get('tool.start')?.({ session_id: 'runtime-1', payload: { name: 'terminal', tool_id: 'tool-1' } })
    handlers.get('tool.complete')?.({
      session_id: 'runtime-1',
      payload: { error: 'blocked', name: 'terminal', tool_id: 'tool-1' }
    })

    expect(seen).toHaveBeenCalledTimes(2)
    expect(seen).toHaveBeenLastCalledWith({ id: 'tool-1', name: 'terminal', status: 'failed' })
  })
})
