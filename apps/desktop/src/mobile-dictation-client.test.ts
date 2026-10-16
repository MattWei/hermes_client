import { describe, expect, it, vi } from 'vitest'

import { createMobileDictationClient, type MobileDictationRest } from './mobile-dictation-client'

type Post = (path: string, body?: unknown) => Promise<Response>

function clientWith(post: Post) {
  return createMobileDictationClient({ post } as MobileDictationRest)
}

const recording = { blob: new Blob(['audio-bytes'], { type: 'audio/mp4' }), mimeType: 'audio/mp4' }

describe('mobile dictation client', () => {
  it('posts the recording as a base64 data URL and returns the transcript', async () => {
    const post = vi.fn(async (_path: string, _body?: unknown) => new Response(JSON.stringify({ ok: true, transcript: 'hello there' })))

    const transcript = await clientWith(post).transcribe(recording)

    expect(transcript).toBe('hello there')
    const [path, body] = post.mock.calls[0]
    expect(path).toBe('/api/audio/transcribe')
    const payload = body as { data_url: string, mime_type: string }
    expect(payload.mime_type).toBe('audio/mp4')
    // The route rejects anything that is not a data URL carrying ;base64 — multipart is not accepted.
    expect(payload.data_url.startsWith('data:audio/mp4;base64,')).toBe(true)
  })

  it('names the profile, because voice config resolves per profile', async () => {
    const post = vi.fn(async (_path: string, _body?: unknown) => new Response(JSON.stringify({ ok: true, transcript: 'x' })))

    await clientWith(post).transcribe(recording, 'shopify')

    expect(post.mock.calls[0][0]).toBe('/api/audio/transcribe?profile=shopify')
  })

  it('treats an empty transcript as an answer rather than a failure', async () => {
    // The backend maps a silent recording to transcript "" so a voice loop can re-listen; making
    // that an error here would raise an alert every time someone pauses.
    const post = vi.fn(async (_path: string, _body?: unknown) => new Response(JSON.stringify({ ok: true, transcript: '' })))

    await expect(clientWith(post).transcribe(recording)).resolves.toBe('')
  })

  it('raises on a refused upload instead of reporting an empty transcript', async () => {
    const post = vi.fn(async (_path: string, _body?: unknown) => new Response('nope', { status: 413 }))

    await expect(clientWith(post).transcribe(recording)).rejects.toThrow('Transcription failed (HTTP 413)')
  })
})
