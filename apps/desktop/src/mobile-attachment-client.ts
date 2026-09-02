export interface MobileAttachmentGateway {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
}

export interface MobileFileAttachment {
  dataUrl: string
  name: string
}

function attachmentReference(result: unknown): string {
  if (!result || typeof result !== 'object') {
    throw new Error('Hermes returned an invalid attachment response')
  }

  const { attached, ref_text: refText } = result as { attached?: unknown; ref_text?: unknown }

  if (attached !== true || typeof refText !== 'string' || !refText) {
    throw new Error('Hermes could not attach this file')
  }

  return refText
}

export function createMobileAttachmentClient(gateway: MobileAttachmentGateway) {
  return {
    async submit(runtimeSessionId: string, text: string, attachments: MobileFileAttachment[]): Promise<void> {
      const refs: string[] = []

      for (const attachment of attachments) {
        if (!attachment.name || !attachment.dataUrl.startsWith('data:')) {
          throw new Error('Invalid file attachment')
        }

        const result = await gateway.request('file.attach', {
          data_url: attachment.dataUrl,
          name: attachment.name,
          path: attachment.name,
          session_id: runtimeSessionId
        })

        refs.push(attachmentReference(result))
      }

      await gateway.request('prompt.submit', {
        session_id: runtimeSessionId,
        text: [text, ...refs].filter(Boolean).join('\n')
      })
    }
  }
}
