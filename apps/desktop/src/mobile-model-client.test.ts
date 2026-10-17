import { describe, expect, it, vi } from 'vitest'

import { createMobileModelClient, readSessionModelInfo } from './mobile-model-client'

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>

function clientWith(request: Request) {
  return createMobileModelClient({ request } as never)
}

describe('mobile model client', () => {
  it('keeps the catalog grouped by provider and reports the gateway selection', async () => {
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
    // Grouping is the data, not decoration: a flat list cannot say which provider owns a model.
    // Bare ids and { id, name } rows both appear in provider payloads.
    expect(options.providers).toEqual([
      {
        models: [
          { id: 'deepseek/deepseek-v4-flash', label: 'deepseek/deepseek-v4-flash' },
          { id: 'gpt-5', label: 'GPT-5' }
        ],
        slug: 'deepseek'
      },
      { models: [{ id: 'claude-sonnet-4-8', label: 'claude-sonnet-4-8' }], slug: 'anthropic' }
    ])
  })

  it('drops a provider row whose slug or catalog is missing', async () => {
    // A row without a slug cannot be switched to; offering it would only produce a failed tap.
    const options = await clientWith(async () => ({
      providers: [
        { models: ['gpt-5'] },
        { models: [], slug: 'empty' },
        { models: ['claude-sonnet-4-8'], slug: 'anthropic' },
        { models: ['gpt-5', 'gpt-5'], slug: 'deepseek' }
      ]
    })).options()

    expect(options.providers.map(provider => provider.slug)).toEqual(['anthropic', 'deepseek'])
    // A catalog that repeats an id lists it once.
    expect(options.providers[1].models).toHaveLength(1)
  })

  it('asks for the catalog on behalf of the live session', async () => {
    // The gateway layers a live session's own model over the config and prepends it to its provider's
    // row; without this the menu cannot tick the model that session is actually running.
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ providers: [] }))

    await clientWith(request).options('runtime-9')

    expect(request).toHaveBeenCalledWith('model.options', {
      explicit_only: true,
      session_id: 'runtime-9'
    })
  })

  it('survives a gateway that answers with something else entirely', async () => {
    // What the desktop mock fixtures answer for any unhandled method.
    const options = await clientWith(async () => ({ status: 'accepted' })).options()

    expect(options).toEqual({ model: '', provider: '', providers: [] })
  })

  it('reads the profile level, and treats a gateway without the getter as no opinion', async () => {
    await expect(clientWith(async () => ({ value: 'high' })).currentEffort()).resolves.toBe('high')
    await expect(clientWith(async () => { throw new Error('unknown config key') }).currentEffort()).resolves.toBe('')
  })

  it('sends the provider with the model, because the listing is resolved per provider', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ value: 'x' }))

    const result = await clientWith(request).setModel('runtime-1', 'gpt-5', 'openai')

    expect(result).toEqual({ applied: true, confirmMessage: '' })
    // A bare id answers "Model was not found in this provider's model listing" for another
    // provider's model; `--provider` is the same flag `/model` accepts.
    expect(request).toHaveBeenCalledWith('config.set', {
      key: 'model',
      session_id: 'runtime-1',
      value: 'gpt-5 --provider openai'
    })
  })

  it('leaves the value bare when no provider is known', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ value: 'x' }))

    await clientWith(request).setModel('runtime-1', 'gpt-5', '')

    expect(request.mock.calls[0][1]).toMatchObject({ value: 'gpt-5' })
  })

  it('does not confirm an expensive model on the first ask', async () => {
    // `confirm_expensive_model` is a spending decision; it must never ride along silently.
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ confirm_message: 'GPT-5 costs more.', confirm_required: true }))

    const result = await clientWith(request).setModel('runtime-1', 'gpt-5', 'openai', false)

    expect(result.applied).toBe(false)
    expect(result.confirmMessage).toBe('GPT-5 costs more.')
    expect(request.mock.calls[0][1]).not.toHaveProperty('confirm_expensive_model')
  })

  it('sends the confirmation only when the caller asked for it', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({ value: 'x' }))

    const result = await clientWith(request).setModel('runtime-1', 'gpt-5', 'openai', true)

    expect(result.applied).toBe(true)
    expect(request.mock.calls[0][1]).toMatchObject({ confirm_expensive_model: true })
  })

  it('reads the model a live session is actually running from `info`', () => {
    // `model.options` reports the CONFIGURED model; this is the session override, and it is what the
    // pill must show after a cold start.
    expect(readSessionModelInfo({
      model: 'claude-sonnet-4-8',
      provider: 'anthropic',
      reasoning_effort: 'high'
    })).toEqual({ effort: 'high', model: 'claude-sonnet-4-8', provider: 'anthropic' })
  })

  it('treats a reply that carries no model info as unknown', () => {
    expect(readSessionModelInfo(undefined)).toBeNull()
    expect(readSessionModelInfo({})).toBeNull()
    expect(readSessionModelInfo({ cwd: '/tmp' })).toBeNull()
  })

  it('changes the thinking level through the reasoning key', async () => {
    const request = vi.fn(async () => ({ value: 'high' }))

    await clientWith(request).setEffort('high')

    expect(request).toHaveBeenCalledWith('config.set', { key: 'reasoning', value: 'high' })
  })
})
