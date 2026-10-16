# The composer input

Phase N. Four changes to the message composer, requested together, plus one decision left open.

## What changed

| Ask | Change |
| --- | --- |
| Drop the rule above the input | `border-t` off the composer form — spacing (`pt-4`) stays, the divider does not |
| Single row, growing with the text | `rows={1}`, height re-measured from `scrollHeight` on every change, capped (`max-h-40`) so a long draft scrolls instead of eating the transcript |
| Enter sends | `onKeyDown` → `requestSubmit()` on Enter; Shift+Enter and an in-flight IME composition keep the newline |
| `+` instead of "Attach" | `Codicon name="add"` inside the same `<label htmlFor>`, still bound to the same file input |

**The IME check is not the Latin-keyboard afterthought it looks like.** A pinyin or kana candidate
is committed with Enter, so a bare `key === 'Enter'` handler sends half-typed text to the model on
the most ordinary keystroke a Chinese user makes. `event.nativeEvent.isComposing` is the guard.

**The height reset is load-bearing.** Measuring against the height the previous keystroke set can
only ever grow the field: set `height = 'auto'` first, then to `scrollHeight`.

## Verified in the artifact, not just in the build

`BUILD SUCCEEDED` says the build ran. Grepping the shipped chunk is what says the edit is in it:

```bash
F=App.app/public/assets/ipad-main-*.js
grep -c 'border-t border-(--ui-stroke-tertiary) pt-4' $F   # 0 — the old form class is gone
grep -o 'mt-auto shrink-0[^`"]*' $F                        # mt-auto shrink-0 pt-4
grep -o 'max-h-40[^`"]*' $F                                # the new textarea classes
grep -o '.\{0,30\}`add`.\{0,30\}' $F                       # name:`add`,size:`1rem`  (the + icon)
```

The minified label shows `{htmlFor:\`ipad-attachment\`,children:b}` with `b` the Codicon element —
and no `aria-label`, which is deliberate: a second one would collide with the file input's own and
make `getByLabelText('Attach file')` ambiguous. That collision is exactly what the first version did,
and the test caught it.

## Tests

- Enter sends; Shift+Enter and `isComposing: true` do not.
- The field starts at `rows=1` and the attach control is still reachable by name — the icon swap
  must not leave it nameless.
- **Not covered:** the growing height. It is computed from `scrollHeight`, which jsdom reports as 0,
  so a unit test can only assert a meaningless `0px`. Device is where it is verified.

`48 passed`, `typecheck` exit 0, no unhandled errors.

## Still open: what the microphone button does

Desktop's mic is not a composer-side record key — it sits in the **voice-conversation** cluster
(`app/chat/composer/controls.tsx`: wake word, mic mute, stop turn, end conversation), which is a
subsystem of its own rather than a button to copy.

The remote gateway does expose the pieces a recording path needs over the same HTTPS connection:

```text
GET  /api/audio/voice-config    -> which STT/TTS provider, and whether it must run on the gateway
POST /api/audio/transcribe      -> {data_url: "data:audio/…;base64,…", mime_type} -> {ok, transcript, provider}
```

So "record → text" is reachable. Two unknowns keep it from being a straight port, and they are why
it was **not** implemented blind: `getUserMedia`/`MediaRecorder` behaviour inside WKWebView, and the
app-level microphone grant (`NSMicrophoneUsageDescription` plus Capacitor's permission plumbing) —
the same class of gap that made the simulator green while the device refused LAN connections.

Options put to the user, with the layout question attached: spike the recording path first
(recommended, and the user's stated preference for unknown-capability work), dictate into the field,
send a voice message as an attachment, or take the whole voice conversation. For the right-hand
side: switch on content (mic when empty, Send when typing), keep both, or drop Send entirely now
that Enter sends.
