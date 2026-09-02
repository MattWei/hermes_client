import { describe, expect, it, vi } from 'vitest'

import { createMobileAttachmentClient } from './mobile-attachment-client'

describe('createMobileAttachmentClient', () => {
  it('stages a file then sends its server reference to the same runtime session', async () => {
    const request = vi.fn(async (method: string) => method === 'file.attach'
      ? { attached: true, ref_text: '@file:uploaded.txt' }
      : { status: 'accepted' })
    const client = createMobileAttachmentClient({ request })

    await client.submit('runtime-42', 'Please read this', [{ dataUrl: 'data:text/plain;base64,SGVsbG8=', name: 'notes.txt' }])

    expect(request).toHaveBeenNthCalledWith(1, 'file.attach', {
      data_url: 'data:text/plain;base64,SGVsbG8=',
      name: 'notes.txt',
      path: 'notes.txt',
      session_id: 'runtime-42'
    })
    expect(request).toHaveBeenNthCalledWith(2, 'prompt.submit', {
      session_id: 'runtime-42',
      text: 'Please read this\n@file:uploaded.txt'
    })
  })
})
