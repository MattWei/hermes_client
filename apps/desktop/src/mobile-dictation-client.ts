export interface MobileVoiceRecording {
  blob: Blob
  mimeType: string
}

/**
 * The transcribe route is the only thing here that posts, so it asks for a POST rather than for the
 * whole session REST surface — widening `MobileSessionRest` instead would have invalidated every
 * mock of it in the suite to satisfy one caller.
 */
export interface MobileDictationRest {
  post(path: string, body?: unknown): Promise<Response>
}

/** The transcribe route takes base64 inside a `data:` URL, not multipart. */
function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read the recording'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
}

export function createMobileDictationClient(rest: MobileDictationRest) {
  return {
    /**
     * Transcribe one recording. An empty transcript is a normal answer rather than a failure — the
     * backend maps a silent recording to `transcript: ""` so a voice loop can re-listen instead of
     * raising on every quiet turn, and the caller decides what an empty result means.
     *
     * The profile travels: voice config is resolved per profile, like every other gateway lookup.
     */
    async transcribe(recording: MobileVoiceRecording, profile?: string): Promise<string> {
      const path = profile
        ? `/api/audio/transcribe?profile=${encodeURIComponent(profile)}`
        : '/api/audio/transcribe'
      const response = await rest.post(path, {
        data_url: await readAsDataUrl(recording.blob),
        mime_type: recording.mimeType
      })
      if (!response.ok) {
        throw new Error(`Transcription failed (HTTP ${response.status})`)
      }
      const body = await response.json() as { transcript?: unknown }
      return typeof body.transcript === 'string' ? body.transcript : ''
    }
  }
}
