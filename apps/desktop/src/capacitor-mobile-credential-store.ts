import { registerPlugin } from '@capacitor/core'

import { createMobileCredentialStore, type NativeCredentialStore } from './mobile-credential-store'

interface NativeSecureStorePlugin {
  get(options: { key: string }): Promise<{ value?: string }>
  remove(options: { key: string }): Promise<void>
  set(options: { key: string, value: string }): Promise<void>
}

const secureStore = registerPlugin<NativeSecureStorePlugin>('SecureStore')

const nativeStore: NativeCredentialStore = {
  async get(key) {
    return (await secureStore.get({ key })).value ?? null
  },
  async remove(key) {
    await secureStore.remove({ key })
  },
  async set(key, value) {
    await secureStore.set({ key, value })
  }
}

export const mobileCredentialStore = createMobileCredentialStore(nativeStore)
