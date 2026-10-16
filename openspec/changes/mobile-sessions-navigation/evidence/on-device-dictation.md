# On-device dictation (spike)

The microphone button had nothing to reach: the gateway transcribes only through a configured STT
provider, and the backend host has none. The iPad has its own Mandarin model, runs it locally for
free, and never sends the audio anywhere — so the device does the work and the gateway upload stays
as the fallback for platforms that cannot.

## Why this shape

| | Gateway upload | On-device |
| --- | --- | --- |
| Needs backend config | an STT provider and a credential, or a local model | **nothing** |
| Audio leaves the iPad | yes | **no** |
| Cost | per-use, or the host's CPU | **0** |
| Works offline | no | **yes** |
| Depends on `MediaRecorder` in the WebView | yes | **no** — the plugin owns the mic |

It also sidesteps the quality ceiling the host imposed: with ~1 GB of free RAM the best local whisper
there was `small`, and Mandarin is where `small` is weakest — especially mid-sentence English terms,
which is exactly how this client gets used.

## What was added

- **`ios/App/App/SpeechPlugin.swift`** — `SFSpeechRecognizer` with `requiresOnDeviceRecognition`,
  four methods: `available({locale})` → capability without prompting, `requestPermission()`,
  `start({locale})` (emits `partial` while it runs), `stop()` → `{ transcript }`.
- **`MainViewController.capacitorDidLoad()`** registers it, the same app-side hook `SecureStorePlugin`
  uses.
- **Four `project.pbxproj` entries.** The project is hand-written: a `PBXBuildFile`, a
  `PBXFileReference`, the group's children list and the target's Sources phase. A Swift file that
  exists on disk but is missing any of them compiles to nothing and reports nothing.
- **`NSSpeechRecognitionUsageDescription`** in `Info.plist`. Absent, the first call terminates the app
  instead of prompting.
- **`src/mobile-speech-recognizer.ts`** wraps the plugin. `support()` returns `null` when the plugin is
  not there — the shape every non-iOS platform produces, since `registerPlugin`'s proxy rejects — and
  that `null` is what sends the composer to the gateway path. It is an answer, not an error.
- **The composer prefers the device**, falls back to the upload, and says which one is live
  (`Listening on this device…` vs `Recording…`) so a tap is decodable without a debugger.

## Verification

| Check | Result |
| --- | --- |
| Typecheck | exit 0 |
| Mobile suite | **17 files / 147 tests** — including five for the recognizer wrapper |
| Swift compiles | `SwiftCompile normal arm64 Compiling SpeechPlugin.swift` |
| Installed | iPad, running |

**A false negative worth recording.** Grepping the built binary for `HermesSpeech` returns 0 — and so
does the same grep for `SecureStore`, a plugin that demonstrably works on this device. `strings` does
not surface these Swift symbols, so the binary check is simply not valid here. The proof the file
reached the target is the compiler line above, not a symbol search. Had the control not been run, this
would have read as "the plugin never made it into the app".

## Not yet verified

The tap. Everything up to and including "the recogniser is installed and can be asked" is proven; that
the device model actually transcribes Chinese, and how it handles mid-sentence English, is what the
tap answers. Failures surface on the status line (a declined grant, no on-device model for the locale,
a recogniser error), so the result is decodable either way.
