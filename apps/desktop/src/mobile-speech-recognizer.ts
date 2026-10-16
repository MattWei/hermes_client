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
}

export interface MobileSpeechSupport {
  /** `true` when the device carries its own model, so the audio never leaves it. */
  onDevice: boolean
  supported: boolean
}

export interface MobileSpeechRecognizer {
  support(locale: string): Promise<MobileSpeechSupport | null>
  start(locale: string): Promise<void>
  stop(): Promise<string>
}

export function createMobileSpeechRecognizer(
  plugin: HermesSpeechPlugin = registerPlugin<HermesSpeechPlugin>('HermesSpeech')
): MobileSpeechRecognizer {
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
    async start(locale: string): Promise<void> {
      const permission = await plugin.requestPermission()
      if (!permission.microphone || permission.speech !== 'authorized') {
        throw new Error('Speech recognition was declined for this device')
      }
      await plugin.start({ locale })
    },

    async stop(): Promise<string> {
      const result = await plugin.stop()
      return result.transcript || ''
    }
  }
}
