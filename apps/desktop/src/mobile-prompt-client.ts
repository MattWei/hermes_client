export interface MobilePromptGateway {
  on(type: string, handler: (event: unknown) => void): () => void
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
}

export interface MobileStreamEvent {
  complete: boolean
  text: string
}

export function createMobilePromptClient(gateway: MobilePromptGateway) {
  return {
    async submit(runtimeSessionId: string, text: string): Promise<void> {
      await gateway.request('prompt.submit', { session_id: runtimeSessionId, text })
    },
    onStream(runtimeSessionId: string, handler: (event: MobileStreamEvent) => void): () => void {
      const forward = (complete: boolean) => (raw: unknown) => {
        const event = raw as { payload?: { text?: unknown }, session_id?: unknown }
        if (event.session_id !== runtimeSessionId || typeof event.payload?.text !== 'string') {
          return
        }
        handler({ complete, text: event.payload.text })
      }
      const unsubscribeDelta = gateway.on('message.delta', forward(false))
      const unsubscribeComplete = gateway.on('message.complete', forward(true))
      return () => {
        unsubscribeDelta()
        unsubscribeComplete()
      }
    }
  }
}
