# Model and thinking selectors on the composer

Phase P. Two quiet selectors above the input — which model answers, and how hard it thinks — matching
the desktop composer's pills.

## The gateway contract

Read off the backend rather than guessed (`tui_gateway/methods_config*.py`,
`tui_gateway/methods_complete.py`):

| Need | Call |
| --- | --- |
| Catalog + current selection | `model.options { explicit_only: true }` → `{ providers: [{ slug, models }], model, provider }` |
| Profile's thinking level | `config.get { key: 'reasoning' }` → `{ value }` |
| Switch the model | `config.set { key: 'model', value, session_id }` |
| Switch the thinking level | `config.set { key: 'reasoning', value }` |

**Model switching requires a live session.** The gateway answers `4001 config.set model requires a live
session` — the keys are matched exactly (`_CONFIG_SETTERS`), so the key is `model`, not `agent.model`.
That constraint is why these pills live in the session detail and not on the list.

**The level pick is session-scoped on purpose.** The backend says so in as many words — a menu pick must
not rewrite the global — so choosing "High" here changes this conversation, not the profile.

**Expensive models need a second decision.** The reply carries `confirm_required` +
`confirm_message`, and only `confirm_expensive_model: true` on a later call performs the switch.

## Two taps, never one

The user's choice for that confirmation: **the first tap changes nothing, shows the gateway's own
message, and the same model has to be tapped again.** `confirm_expensive_model` is never attached to a
first pick, and there is a test asserting the parameter is absent — a single tap that quietly spends
money is the worst failure mode this control has.

## Labels come from the desktop, not from a second implementation

`lib/reasoning-effort.ts` (Min / Low / **Med** / High / XHigh / Max / Ultra) and
`lib/model-status-label.ts` are pure modules with no IPC, so the mobile surface calls the same
functions the desktop pill does. That is why the label reads `Med` rather than "Medium": a second
formatter would drift, which is exactly how the session-label bug was born.

The effort label falls back to the profile's level (`config.get reasoning`) before the built-in
`medium` — the same precedence the desktop pill uses, so the label never advertises a level the agent
will not use.

## Notes

- The catalog normalizer accepts both shapes a provider row can carry: a bare id string, or
  `{ id, name }`. A gateway that answers with something else entirely (the desktop fixture answers
  `{status: 'accepted'}` for unhandled methods) yields an empty catalog rather than throwing — the
  pills then keep what they had.
- Choosing an effort clears the status line, because the previous message is often the expensive-model
  warning for a model the person has now abandoned.
- Not exposed: `fast` and `thinking_mode`, which exist as `config.set` keys but were not asked for.
