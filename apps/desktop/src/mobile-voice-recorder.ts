export interface MobileVoiceRecording {
  blob: Blob
  mimeType: string
}

export interface MobileVoiceRecorder {
  start(): Promise<void>
  stop(): Promise<MobileVoiceRecording | null>
}

/**
 * iOS records AAC in an MP4 container; Chromium prefers WebM/Opus. Ask for the first one the WebView
 * admits to supporting — a hardcoded `audio/webm` records nothing at all on iOS, because
 * `MediaRecorder` there cannot produce it.
 */
const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

/** Microphone failures arrive as `DOMException`s whose names are the only thing worth translating. */
export function readableMicrophoneError(error: unknown): Error {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new Error('Microphone access was denied')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new Error('No microphone is available')
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new Error('The microphone is already in use')
  }
  return error instanceof Error ? error : new Error('Unable to record audio')
}

/**
 * Records until told to stop. Deliberately not a press-and-hold gesture: on a touch surface a
 * press-to-talk button competes with scrolling and gives no way to see that recording is live.
 */
export function createMobileVoiceRecorder(): MobileVoiceRecorder {
  let chunks: Blob[] = []
  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null

  function release() {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    mediaRecorder = null
    chunks = []
  }

  return {
    async start(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('This device cannot record audio')
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const supported = MIME_CANDIDATES.find(candidate => MediaRecorder.isTypeSupported?.(candidate))
      mediaRecorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined)
      chunks = []
      mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      })
      mediaRecorder.start()
    },

    stop(): Promise<MobileVoiceRecording | null> {
      const recorder = mediaRecorder
      if (!recorder) {
        return Promise.resolve(null)
      }
      return new Promise(resolve => {
        recorder.addEventListener('stop', () => {
          const mimeType = recorder.mimeType || chunks[0]?.type || MIME_CANDIDATES[0]
          const blob = new Blob(chunks, { type: mimeType })
          release()
          // A stop with nothing captured is not a recording; the caller should stay quiet about it.
          resolve(blob.size > 0 ? { blob, mimeType } : null)
        }, { once: true })
        recorder.stop()
      })
    }
  }
}
