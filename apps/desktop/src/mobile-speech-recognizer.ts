import { registerPlugin } from '@capacitor/core'

/**
 * The iOS-only dictation plugin (`ios/App/App/SpeechPlugin.swift`).
 *
 * Deliberately not a Capacitor package: it is registered app-side from `MainViewController`, so on
 * every other platform each call rejects. That rejection is the normal way this reports "no native
 * recogniser here", which is what sends the composer back to the gateway path — never an error the
 * user should see.
 */
export interface HermesSpeechPlugin {
  available(options: { locale: string }): Promise<{ onDevice: boolean, status: string, supported: boolean }>
  requestPermission(): Promise<{ microphone: boolean, speech: string }>
  start(options: { locale: string }): Promise<void>
  stop(): Promise<{ transcript: string }>
  addListener(event: 'partial', handler: (data: { text: string }) => void): Promise<{ remove(): Promise<void> }>
}

export interface MobileSpeechSupport {
  /** `true` when the device carries its own model, so the audio never leaves it. */
  onDevice: boolean
  supported: boolean
}

export interface MobileSpeechRecognizer {
  support(locale: string): Promise<MobileSpeechSupport | null>
  /** `onPartial` receives the transcript so far, repeatedly, while the person is still speaking. */
  start(locale: string, onPartial?: (text: string) => void): Promise<void>
  stop(): Promise<string>
}

export function createMobileSpeechRecognizer(
  plugin: HermesSpeechPlugin = registerPlugin<HermesSpeechPlugin>('HermesSpeech')
): MobileSpeechRecognizer {
  let detachPartial: (() => void) | null = null

  return {
    /** `null` means "nothing native here" — Android, a browser, or a build whose plugin did not register. */
    async support(locale: string): Promise<MobileSpeechSupport | null> {
      try {
        const support = await plugin.available({ locale })
        return { onDevice: Boolean(support.onDevice), supported: Boolean(support.supported) }
      } catch {
        return null
      }
    },

    /**
     * Ask for both grants before touching the recogniser. iOS otherwise fails the recognition task
     * with something generic instead of prompting, and a refusal has to be reportable rather than
     * silent — on-device dictation is worthless if the person cannot tell that it was declined.
     */
    async start(locale: string, onPartial?: (text: string) => void): Promise<void> {
      const permission = await plugin.requestPermission()
      if (!permission.microphone || permission.speech !== 'authorized') {
        throw new Error('Speech recognition was declined for this device')
      }
      if (onPartial) {
        const handle = await plugin.addListener('partial', data => onPartial(data.text || ''))
        detachPartial = () => { void handle.remove() }
      }
      await plugin.start({ locale })
    },

    async stop(): Promise<string> {
      // Detached before the stop call: the last partial arrives with the final result, and a listener
      // that outlives its recording would write into an editor the person has moved on from.
      detachPartial?.()
      detachPartial = null
      const result = await plugin.stop()
      return result.transcript || ''
    }
  }
}
