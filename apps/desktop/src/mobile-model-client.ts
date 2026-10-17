import type { MobileGatewayRequest } from './mobile-session-client'

export interface MobileModelOption {
  id: string
  label: string
}

export interface MobileModelOptions {
  model: string
  models: MobileModelOption[]
  provider: string
}

/**
 * One `config.set` reply. `confirm_required` is the gateway refusing to switch to an expensive model
 * without a second, explicit decision — it costs real money, so it is surfaced rather than swallowed.
 */
export interface MobileModelSwitchResult {
  confirmMessage: string
  /** `true` when the switch actually happened; `false` when the gateway is waiting for confirmation. */
  applied: boolean
}

interface ModelOptionsPayload {
  model?: unknown
  providers?: unknown
  provider?: unknown
}

interface ProviderPayload {
  models?: unknown
  name?: unknown
  slug?: unknown
}

/** A model entry arrives as a bare id or as `{ id, name }`, depending on the provider row. */
function readModelEntry(entry: unknown): MobileModelOption | null {
  if (typeof entry === 'string') {
    const id = entry.trim()
    return id ? { id, label: id } : null
  }
  if (entry && typeof entry === 'object') {
    const record = entry as { id?: unknown, name?: unknown, value?: unknown }
    const id = String(record.id ?? record.value ?? '').trim()
    if (id) {
      return { id, label: String(record.name ?? id).trim() || id }
    }
  }
  return null
}

export function createMobileModelClient(gateway: MobileGatewayRequest) {
  return {
    /** The catalog plus the gateway's own current selection, which is what the pill shows. */
    async options(): Promise<MobileModelOptions> {
      const payload = await gateway.request('model.options', { explicit_only: true }) as ModelOptionsPayload
      const providers = Array.isArray(payload?.providers) ? payload.providers as ProviderPayload[] : []
      const models: MobileModelOption[] = []
      for (const provider of providers) {
        const entries = Array.isArray(provider?.models) ? provider.models : []
        for (const entry of entries) {
          const option = readModelEntry(entry)
          if (option) {
            models.push(option)
          }
        }
      }
      return {
        model: String(payload?.model ?? '').trim(),
        models,
        provider: String(payload?.provider ?? '').trim()
      }
    },

    /** The profile's level, used until a session override exists — the same fallback the desktop pill uses. */
    async currentEffort(): Promise<string> {
      try {
        const payload = await gateway.request('config.get', { key: 'reasoning' }) as { value?: unknown }
        return String(payload?.value ?? '').trim()
      } catch {
        // A gateway without the getter simply has no opinion; the caller falls back to the default.
        return ''
      }
    },

    /**
     * Switch the model of a live session.
     *
     * The gateway refuses this without a session (`config.set model requires a live session`) and
     * answers `confirm_required` for an expensive model. Callers pass `confirm` only after the person
     * has been shown that message and chosen again — never on the strength of a single tap.
     */
    async setModel(sessionId: string, model: string, confirm = false): Promise<MobileModelSwitchResult> {
      const reply = await gateway.request('config.set', {
        key: 'model',
        session_id: sessionId,
        value: model,
        ...(confirm ? { confirm_expensive_model: true } : {})
      }) as { confirm_message?: unknown, confirm_required?: unknown }
      if (reply?.confirm_required) {
        return {
          applied: false,
          confirmMessage: String(reply.confirm_message ?? 'This model costs more than the current one.')
        }
      }
      return { applied: true, confirmMessage: '' }
    },

    /** Session-scoped when a session is live: the gateway deliberately does not rewrite the profile. */
    async setEffort(level: string): Promise<void> {
      await gateway.request('config.set', { key: 'reasoning', value: level })
    }
  }
}
