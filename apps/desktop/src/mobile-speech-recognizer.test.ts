import { describe, expect, it, vi } from 'vitest'

import { createMobileSpeechRecognizer, type HermesSpeechPlugin } from './mobile-speech-recognizer'

function pluginWith(overrides: Partial<HermesSpeechPlugin> = {}): HermesSpeechPlugin {
  return {
    available: vi.fn(async () => ({ onDevice: true, status: 'authorized', supported: true })),
    requestPermission: vi.fn(async () => ({ microphone: true, speech: 'authorized' })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({ transcript: '你好' })),
    ...overrides
  }
}

describe('mobile speech recognizer', () => {
  it('reports nothing native when the plugin is not registered', async () => {
    // What every non-iOS platform produces: registerPlugin's proxy rejects. That is an answer rather
    // than an error — the composer has to fall back to the gateway, not surface a failure.
    const recognizer = createMobileSpeechRecognizer(pluginWith({
      available: vi.fn(async () => {
        throw new Error('"HermesSpeech" plugin is not implemented on web')
      })
    }))

    await expect(recognizer.support('zh-CN')).resolves.toBeNull()
  })

  it('reports on-device support when the device carries a model', async () => {
    const recognizer = createMobileSpeechRecognizer(pluginWith())

    await expect(recognizer.support('zh-CN')).resolves.toEqual({ onDevice: true, supported: true })
  })

  it('asks for both grants before it starts listening', async () => {
    const plugin = pluginWith()

    await createMobileSpeechRecognizer(plugin).start('zh-CN')

    expect(plugin.requestPermission).toHaveBeenCalled()
    expect(plugin.start).toHaveBeenCalledWith({ locale: 'zh-CN' })
  })

  it('refuses to start on a declined grant, and says why', async () => {
    // Silently doing nothing here would look exactly like a dead button.
    const plugin = pluginWith({
      requestPermission: vi.fn(async () => ({ microphone: true, speech: 'denied' }))
    })

    await expect(createMobileSpeechRecognizer(plugin).start('zh-CN'))
      .rejects.toThrow('Speech recognition was declined for this device')
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it('treats an empty transcript as an answer', async () => {
    const recognizer = createMobileSpeechRecognizer(pluginWith({ stop: vi.fn(async () => ({ transcript: '' })) }))

    await expect(recognizer.stop()).resolves.toBe('')
  })
})
