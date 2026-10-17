import { describe, expect, it, vi } from 'vitest'

import { createMobileModelClient } from './mobile-model-client'

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>

function clientWith(request: Request) {
  return createMobileModelClient({ request } as never)
}

describe('mobile model client', () => {
  it('flattens the catalog and reports the gateway selection', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({
      model: 'deepseek/deepseek-v4-flash',
      provider: 'deepseek',
      providers: [
        { models: ['deepseek/deepseek-v4-flash', { id: 'gpt-5', name: 'GPT-5' }], slug: 'deepseek' },
        { models: [{ id: 'claude-sonnet-4-8' }], slug: 'anthropic' }
      ]
    }))

    const options = await clientWith(request).options()

    expect(options.model).toBe('deepseek/deepseek-v4-flash')
    expect(options.provider).toBe('deepseek')
    // Bare ids and { id, name } rows both appear in provider payloads.
    expect(options.models).toEqual([
      { id: 'deepseek/deepseek-v4-flash', label: 'deepseek/deepseek-v4-flash' },
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'claude-sonnet-4-8', label: 'claude-sonnet-4-8' }
    ])
  })

  it('survives a gateway that answers with something else entirely', async () => {
    // What the desktop mock fixtures answer for any unhandled method.
    const options = await clientWith(async () => ({ status: 'accepted' })).options()

    expect(options).toEqual({ model: '', models: [], provider: '' })
  })

  it('reads the profile level, and treats a gateway without the getter as no opinion', async () => {
    await expect(clientWith(async () => ({ value: 'high' })).currentEffort()).resolves.toBe('high')
    await expect(clientWith(async () => { throw new Error('unknown config key') }).currentEffort()).resolves.toBe('')
  })

  it('switches a model, and names the session the switch applies to', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ value: 'x' }))

    const result = await clientWith(request).setModel('runtime-1', 'gpt-5')

    expect(result).toEqual({ applied: true, confirmMessage: '' })
    expect(request).toHaveBeenCalledWith('config.set', {
      key: 'model',
      session_id: 'runtime-1',
      value: 'gpt-5'
    })
  })

  it('does not confirm an expensive model on the first ask', async () => {
    // `confirm_expensive_model` is a spending decision; it must never ride along silently.
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ confirm_message: 'GPT-5 costs more.', confirm_required: true }))

    const result = await clientWith(request).setModel('runtime-1', 'gpt-5', false)

    expect(result.applied).toBe(false)
    expect(result.confirmMessage).toBe('GPT-5 costs more.')
    expect(request.mock.calls[0][1]).not.toHaveProperty('confirm_expensive_model')
  })

  it('sends the confirmation only when the caller asked for it', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ value: 'x' }))

    const result = await clientWith(request).setModel('runtime-1', 'gpt-5', true)

    expect(result.applied).toBe(true)
    expect(request.mock.calls[0][1]).toMatchObject({ confirm_expensive_model: true })
  })

  it('changes the thinking level through the reasoning key', async () => {
    const request = vi.fn(async () => ({ value: 'high' }))

    await clientWith(request).setEffort('high')

    expect(request).toHaveBeenCalledWith('config.set', { key: 'reasoning', value: 'high' })
  })
})
