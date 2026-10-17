import type { MobileGatewayRequest } from './mobile-session-client'

export interface MobileModelOption {
  id: string
  label: string
}

/** One provider's slice of the catalog. The menu groups on this: a flat list loses which provider owns a model. */
export interface MobileModelProvider {
  models: MobileModelOption[]
  slug: string
}

export interface MobileModelOptions {
  model: string
  provider: string
  providers: MobileModelProvider[]
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

export interface MobileSessionModelInfo {
  effort: string
  model: string
  provider: string
}

/**
 * The model a live session is actually running, from a `session.resume` reply's `info` — the backend's
 * `_session_info`, which reports the session override and any pending switch.
 *
 * This is a different tier from `model.options.model`, which reports the CONFIGURED model. Trusting the
 * catalog is how a cold start put the old model back in the pill while the agent had already been
 * switched and was answering as the new one.
 */
export function readSessionModelInfo(info: unknown): MobileSessionModelInfo | null {
  if (!info || typeof info !== 'object') {
    return null
  }
  const record = info as { model?: unknown, provider?: unknown, reasoning_effort?: unknown }
  const model = String(record.model ?? '').trim()
  const provider = String(record.provider ?? '').trim()
  const effort = String(record.reasoning_effort ?? '').trim()
  return model || provider || effort ? { effort, model, provider } : null
}

export function createMobileModelClient(gateway: MobileGatewayRequest) {
  return {
    /**
     * The catalog grouped by provider, plus the gateway's own current selection.
     *
     * `sessionId` is load-bearing: the gateway layers a LIVE session's own provider/model over the
     * config, and prepends that model to its provider's row. Asked without it, the catalog answers for
     * the profile default instead — so a session pinned to another model has no row to tick, and a model
     * dropped from the provider's live listing looks absent from the catalog entirely.
     */
    async options(sessionId?: string): Promise<MobileModelOptions> {
      const payload = await gateway.request('model.options', {
        explicit_only: true,
        ...(sessionId ? { session_id: sessionId } : {})
      }) as ModelOptionsPayload
      const rows = Array.isArray(payload?.providers) ? payload.providers as ProviderPayload[] : []
      const providers: MobileModelProvider[] = []
      for (const row of rows) {
        const slug = String(row?.slug ?? row?.name ?? '').trim()
        const entries = Array.isArray(row?.models) ? row.models : []
        const models: MobileModelOption[] = []
        for (const entry of entries) {
          const option = readModelEntry(entry)
          if (option && !models.some(existing => existing.id === option.id)) {
            models.push(option)
          }
        }
        // A provider with no slug cannot be switched to (the slug is what the switch sends), so it is
        // dropped rather than shown as an option that would fail.
        if (slug && models.length > 0) {
          providers.push({ models, slug })
        }
      }
      return {
        model: String(payload?.model ?? '').trim(),
        provider: String(payload?.provider ?? '').trim(),
        providers
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
     * **The provider rides along in the value string**, as `/model`'s own `--provider` flag: the target
     * resolver looks a model up inside one provider's listing, so a bare id answers "Model was not found
     * in this provider's model listing" for any model that belongs to a different provider.
     *
     * The gateway refuses this without a session (`config.set model requires a live session`) and answers
     * `confirm_required` for an expensive model. Callers pass `confirm` only after the person has been
     * shown that message and chosen again — never on the strength of a single tap.
     */
    async setModel(
      sessionId: string,
      model: string,
      provider: string,
      confirm = false
    ): Promise<MobileModelSwitchResult> {
      const target = provider ? `${model} --provider ${provider}` : model
      const reply = await gateway.request('config.set', {
        key: 'model',
        session_id: sessionId,
        value: target,
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
