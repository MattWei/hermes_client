export interface MobileToolActivityGateway {
  on(type: string, handler: (event: unknown) => void): () => void
}

export type MobileToolActivityStatus = 'running' | 'complete' | 'failed'

export interface MobileToolActivity {
  id: string
  name: string
  status: MobileToolActivityStatus
}

function activityFromEvent(type: string, event: unknown): MobileToolActivity | null {
  if (!event || typeof event !== 'object') {
    return null
  }

  const payload = (event as { payload?: unknown }).payload

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const { error, name, tool_id: toolId } = payload as { error?: unknown; name?: unknown; tool_id?: unknown }

  if (typeof name !== 'string' || !name || typeof toolId !== 'string' || !toolId) {
    return null
  }

  return {
    id: toolId,
    name,
    status: type === 'tool.complete' ? (error ? 'failed' : 'complete') : 'running'
  }
}

export function createMobileToolActivityClient(gateway: MobileToolActivityGateway) {
  return {
    onActivity(sessionId: string, handler: (activity: MobileToolActivity) => void): () => void {
      const subscribe = (type: 'tool.start' | 'tool.progress' | 'tool.complete') =>
        gateway.on(type, event => {
          if (!event || typeof event !== 'object' || (event as { session_id?: unknown }).session_id !== sessionId) {
            return
          }

          const activity = activityFromEvent(type, event)

          if (activity) {
            handler(activity)
          }
        })

      const unsubs = [subscribe('tool.start'), subscribe('tool.progress'), subscribe('tool.complete')]

      return () => unsubs.forEach(unsub => unsub())
    }
  }
}
