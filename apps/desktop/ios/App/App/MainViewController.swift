import UIKit
import Capacitor

/// Bridge view controller for the Hermes mobile shell.
///
/// The board is generated outside macOS, so the Capacitor iOS template never
/// had an app-side `CAPBridgeViewController` subclass. Registering the local
/// Keychain plugin needs one: `capacitorDidLoad()` is the supported hook for
/// app-local (non-package) plugins.
@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureStorePlugin())
        bridge?.registerPluginInstance(SpeechPlugin())
    }
}
