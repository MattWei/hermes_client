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

## The provider is part of the pick

The first cut flattened `providers[]` into one model list and sent a bare id to `config.set`. That is
the bug the user hit on hardware: **`Model was not found in this provider's model listing`** for any
model belonging to a different provider.

Why: the target resolver looks a model up inside *one* provider's listing, and the backend says so
plainly in `_stash_pending_model_switch` —

```python
# A bare pick resolves against the live provider at turn start; guard on that same provider
# here, or a provider-keyed price check passes now and drops the queued pick later.
guard_provider = pending_provider or (getattr(agent, "provider", "") or "").strip()
```

So the fix is that **the provider travels with the model**, exactly as `/model`'s own `--provider`
flag: `value: '<model> --provider <slug>'` (`_VALUE_FLAGS` holds the spelling). That also covers the
deferred path — `session["pending_model_switch"]` keeps the raw string, provider included, so a pick
stashed while a turn streams still resolves against the right listing.

The menu groups by provider as a consequence, not as decoration: a model id alone does not identify
which listing to search, so the group is the missing half of the pick. The expensive-model confirmation
is keyed on `provider/model` for the same reason — two providers can list a model of the same name, and
confirming one must not confirm the other.

## Two taps, never one

The user's choice for that confirmation: **the first tap changes nothing, shows the gateway's own
message, and the same model has to be tapped again.** `confirm_expensive_model` is never attached to a
first pick, and there is a test asserting the parameter is absent — a single tap that quietly spends
money is the worst failure mode this control has.

## The pill after a cold start: two tiers of truth

Reported on hardware: switched to another model, killed the app, reopened — the pill showed the **old**
model while the agent answered as the **new** one. The backend was right; the client was reading the
wrong tier.

- `model.options.model` is the **configured** model — the profile default. It knows nothing about a
  session override.
- `session.resume`'s reply carries `info` = the backend's `_session_info(...)`: `model`, `provider`,
  `reasoning_effort` (`provider` there is already `pending_provider or provider`, so a switch queued
  mid-turn is reported too).

So the resume reply is the authority and the catalog is the fallback. `mobile-session-client.resume()`
used to drop `info` on the floor; it now passes it out, `readSessionModelInfo` parses it, and the pills
seed from it before `sessionId` flips (the catalog effect runs after, and is written as
`current.model || options.model` so it cannot overwrite a session's own pick).

This is the desktop's own path, not a parallel invention: its `SessionResumeResponse`
(`types/hermes.ts`) carries `info`, and `use-session-actions/utils.ts` restores the pill with
`if (typeof info.model === 'string') sessionState.model = info.model`.

One related flip: **a new session clears the pill's model/provider/level**, because a new session runs on
the profile default — inheriting the previous session's pick would be the same lie in the other
direction.

## A profile switch re-arms the restore

Reported: switching profile left the new profile on an empty list instead of its own last conversation.

The restore is a **one-shot**: `restoreAttempted` guards it so a cold start returns to the last session
exactly once, and `activeSessionRef` marks what is open. `selectProfile` cleared the session state but
left both guards in place — `restoreAttempted` was already `true` from the previous profile, so the
effect returned immediately and the work profile never asked for its own session.

Switching profile is a workspace switch, not a fresh launch (the same distinction the desktop's guide
draws): the session state is cleared, `activeSessionRef` is emptied, and the restore is re-armed so the
*new* profile returns to **its** conversation. The model pills are cleared with it — a profile has its
own default, and carrying the previous one over would misreport what a new session runs on.

## The catalog must be asked on behalf of the session

Second hardware report: after a cold start the pill showed `DeepSeek V4 Flash` and the menu ticked
nothing. Both are one cause.

`model.options` takes a `session_id` (`_session_agent(params)` reads it) and, when that session is live,
layers the **session's** provider/model over the config — which is also what makes the backend prepend
that model to its provider's row. Asked without it, the catalog answers for the **profile default**, so:

- the pill's model (from resume `info`) and the catalog's `model` disagree, and
- the row for the session's provider is built from the live listing alone — the session's own model is
  not in it, so there is no row to tick.

Verified against the real backend by building the payload both ways:

```
config context     -> current 'deepseek-flash'       deepseek: ['deepseek-flash', 'deepseek-v4-pro']
session override   -> current 'deepseek-v4-flash'    deepseek: ['deepseek-v4-flash', 'deepseek-flash', 'deepseek-v4-pro']
```

So the picker now passes `session_id`, and the model a session is pinned to stays visible and marked even
when the provider's live listing has moved on. That is a real case here: a session created before the
profile was re-pointed keeps `deepseek-v4-flash`, which DeepSeek no longer lists.

## Opening on the pick in force

A menu that starts at the top makes someone hunt for the row the pill is already advertising, so the
list opens on the current model — marked with a check and scrolled into view.

Two details are ported from the desktop's `composer/trigger-popover.tsx` rather than invented:

- **The current row is marked with `role="menuitemradio"` + `aria-checked`**, not a bare style class:
  a single-choice menu that only *looks* selected is wrong for assistive tech, and the attribute is
  also what the scroll looks for.
- **The list moves itself; `scrollIntoView` is not used.** From the desktop source: *"`scrollIntoView`
  may also move the transcript or window because it operates on every scrollable ancestor."* The panel
  computes both rects and adjusts its own `scrollTop` by the overflow at the nearer edge.

The mark is keyed on `provider/model`, never the model id alone — two providers can list the same name,
and the check has to sit on the row that is actually in force.

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
