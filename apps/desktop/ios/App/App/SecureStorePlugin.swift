import Foundation
import Capacitor
import Security

/// iOS counterpart of `SecureStorePlugin.java`.
///
/// Store contract (must match the Android plugin and
/// `src/mobile-credential-store.ts`):
/// - `set({ key, value })`   -> resolves with no payload
/// - `get({ key })`          -> resolves `{ value }`, or resolves empty when absent
/// - `remove({ key })`       -> resolves with no payload
///
/// Values live in the Keychain as generic-password items scoped to this app's
/// service, marked `AfterFirstUnlockThisDeviceOnly` so the credential survives
/// relaunch but is never migrated to another device.
@objc(SecureStorePlugin)
public class SecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStorePlugin"
    public let jsName = "SecureStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "hermes.mobile.secure-store"

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("key and value are required")
            return
        }
        do {
            try store(key: key, value: value)
            call.resolve()
        } catch {
            call.reject("Unable to securely save credential (\(error))", nil, error)
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        do {
            if let value = try read(key: key) {
                call.resolve(["value": value])
            } else {
                call.resolve()
            }
        } catch {
            call.reject("Unable to securely read credential (\(error))", nil, error)
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        do {
            try delete(key: key)
            call.resolve()
        } catch {
            call.reject("Unable to remove credential (\(error))", nil, error)
        }
    }

    // MARK: - Keychain

    private func baseQuery(key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }

    private func store(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw SecureStoreError.encodingFailed
        }
        // Upsert: drop any existing item first so we never keep a stale value.
        SecItemDelete(baseQuery(key: key) as CFDictionary)
        var query = baseQuery(key: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SecureStoreError.keychain(status)
        }
    }

    private func read(key: String) throws -> String? {
        var query = baseQuery(key: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = item as? Data else {
            throw SecureStoreError.keychain(status)
        }
        guard let value = String(data: data, encoding: .utf8) else {
            throw SecureStoreError.decodingFailed
        }
        return value
    }

    private func delete(key: String) throws {
        let status = SecItemDelete(baseQuery(key: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SecureStoreError.keychain(status)
        }
    }
}

enum SecureStoreError: Error, CustomStringConvertible {
    case encodingFailed
    case decodingFailed
    case keychain(OSStatus)

    var description: String {
        switch self {
        case .encodingFailed:
            return "encoding failed"
        case .decodingFailed:
            return "decoding failed"
        case .keychain(let status):
            return "keychain status \(status)"
        }
    }
}
