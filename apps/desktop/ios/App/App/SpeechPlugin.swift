import AVFoundation
import Capacitor
import Foundation
import Speech

/// On-device dictation for the mobile shell.
///
/// The gateway only transcribes through a configured STT provider, so a host without one refuses the
/// upload outright — which is exactly what the iPad was getting. The device already carries a
/// Mandarin model, runs it locally for nothing and sends the audio nowhere, so the microphone button
/// prefers this and falls back to the gateway path only where the device cannot do it.
///
/// Contract (mirrors `src/mobile-speech-recognizer.ts`):
/// - `available({ locale })` -> `{ supported, onDevice, status }` — capability probe, prompts nothing
/// - `requestPermission()`   -> `{ speech, microphone }` — the two prompts, asked once by the caller
/// - `start({ locale })`     -> resolves once recording; emits `partial` while it runs
/// - `stop()`                -> `{ transcript }`
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "HermesSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var audioEngine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var transcript = ""
    private var failure: String?
    private var tapInstalled = false
    private var stopCall: CAPPluginCall?

    // MARK: - Capability

    @objc func available(_ call: CAPPluginCall) {
        let locale = Locale(identifier: call.getString("locale") ?? "zh-CN")
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            call.resolve(["supported": false, "onDevice": false, "status": authorizationName()])
            return
        }
        call.resolve([
            "supported": true,
            "onDevice": recognizer.supportsOnDeviceRecognition,
            "status": authorizationName()
        ])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { [weak self] speech in
            let ask: (@escaping (Bool) -> Void) -> Void
            if #available(iOS 17.0, *) {
                ask = { completion in AVAudioApplication.requestRecordPermission(completionHandler: completion) }
            } else {
                ask = { completion in AVAudioSession.sharedInstance().requestRecordPermission(completion) }
            }
            ask { microphone in
                DispatchQueue.main.async {
                    call.resolve([
                        "microphone": microphone,
                        "speech": speech == .authorized ? "authorized" : (self?.authorizationName() ?? "unknown")
                    ])
                }
            }
        }
    }

    // MARK: - Recording

    @objc func start(_ call: CAPPluginCall) {
        let locale = Locale(identifier: call.getString("locale") ?? "zh-CN")
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            call.reject("On-device speech recognition is not available for \(locale.identifier)")
            return
        }

        // Two engines installed on one input node is a crash rather than an error, so a second start
        // replaces the first instead of stacking on it.
        teardown()
        transcript = ""
        failure = nil

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // The whole point of this path: the audio never leaves the device.
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let engine = AVAudioEngine()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let format = engine.inputNode.outputFormat(forBus: 0)
            engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            tapInstalled = true
            engine.prepare()
            try engine.start()
        } catch {
            teardown()
            call.reject("Unable to record audio (\(error.localizedDescription))")
            return
        }
        audioEngine = engine

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                self.transcript = result.bestTranscription.formattedString
                DispatchQueue.main.async {
                    self.notifyListeners("partial", data: ["text": self.transcript])
                }
                if result.isFinal {
                    self.finishStop()
                }
            }
            if let error {
                self.failure = error.localizedDescription
                self.finishStop()
            }
        }

        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard stopCall == nil else {
            call.resolve(["transcript": transcript])
            return
        }
        stopCall = call
        // Ending the audio is what lets the task report a final result; the timer is the floor under a
        // silent recording, which can otherwise sit there producing nothing.
        request?.endAudio()
        audioEngine?.stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            self?.finishStop()
        }
    }

    /// Resolves the pending `stop()` once. Called by the recognition result, the error, or the timer —
    /// whichever arrives first wins, because only the first clears `stopCall`.
    private func finishStop() {
        guard let call = stopCall else { return }
        stopCall = nil
        let text = transcript
        let error = failure
        teardown()
        if text.isEmpty, let error {
            call.reject("Speech recognition failed (\(error))")
        } else {
            call.resolve(["transcript": text])
        }
    }

    private func teardown() {
        task?.cancel()
        task = nil
        request = nil
        audioEngine?.stop()
        if tapInstalled {
            audioEngine?.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        audioEngine = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func authorizationName() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }
}
