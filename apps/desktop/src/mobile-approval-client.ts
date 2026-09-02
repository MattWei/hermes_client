export interface MobileApprovalGateway {
  on(type: string, handler: (event: unknown) => void): () => void
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
}

export interface MobileApprovalRequest {
  command?: string
  description?: string
  requestId: string
}

export function createMobileApprovalClient(gateway: MobileApprovalGateway) {
  return {
    onRequest(runtimeSessionId: string, handler: (request: MobileApprovalRequest) => void): () => void {
      return gateway.on('approval.request', raw => {
        const event = raw as {
          payload?: { command?: unknown; description?: unknown; request_id?: unknown }
          session_id?: unknown
        }

        if (
          event.session_id !== runtimeSessionId ||
          typeof event.payload?.request_id !== 'string' ||
          !event.payload.request_id
        ) {
          return
        }

        handler({
          ...(typeof event.payload.command === 'string' ? { command: event.payload.command } : {}),
          ...(typeof event.payload.description === 'string' ? { description: event.payload.description } : {}),
          requestId: event.payload.request_id
        })
      })
    },
    async respond(runtimeSessionId: string, requestId: string, choice: 'deny' | 'once'): Promise<void> {
      await gateway.request('approval.respond', { choice, request_id: requestId, session_id: runtimeSessionId })
    }
  }
}
