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

## The microphone button

**The user chose the layout**: the right-hand control switches on content — the microphone while the
field is empty, `arrow-up` (the desktop composer's own send glyph, `controls.tsx`) once there is text.

**The behaviour is dictation**, chosen here because the layout implies it and a mic button with
nothing behind it is a dead control: record → transcribe → the transcript lands in the *draft*, so
what was heard can be corrected before it reaches the model. A voice message and the desktop's full
voice conversation (wake word, continuous listening, TTS replies) remain larger, separate options.

Two taps rather than press-and-hold: a hold gesture fights the scroll on a touch surface and gives no
way to see that it is live, while a second tap is unambiguous and the icon shows the state
(`mic` → `record`).

### De-risked before writing it

| Unknown | Answer |
| --- | --- |
| Does the WebView refuse `getUserMedia`? | No. Capacitor 8.5's `WebViewDelegationHandler` already implements `requestMediaCapturePermissionFor` and answers `.grant`, so the iOS 15+ gate that would silently deny the page is open. |
| Does the app declare a microphone reason? | It did, but the copy described recording **video** ("Record a video to attach it…"). Corrected to describe a voice input. |
| Can iOS record WebM? | No — so the recorder asks for `audio/mp4` first and only falls back to WebM/Opus, which is what a Chromium WebView wants. A hardcoded `audio/webm` records nothing on iOS. |

The gateway side was already there: `POST /api/audio/transcribe` takes base64 in a `data:` URL and
returns `{ok, transcript, provider}`, and voice config resolves per profile, so the profile rides
along like every other lookup.

### Still unproven

**The recording leg on the device.** `getUserMedia` + `MediaRecorder` inside WKWebView on iPadOS is
the part a build cannot answer, and it needs a real tap. That is why the failure path is deliberately
loud: a refusal lands on the status line with its reason (`Microphone access was denied`,
`This device cannot record audio`, …) instead of leaving a button that looks broken. A tap that
produces text proves the path; a tap that produces a sentence proves where it stops.

Vitest runs it too, incidentally: jsdom has no `MediaRecorder`, so the suite exercises exactly the
"cannot record" branch and asserts the message appears.

