export interface NativeCredentialStore {
  get(key: string): Promise<string | null>
  remove(key: string): Promise<void>
  set(key: string, value: string): Promise<void>
}

export interface MobileTokenPair {
  accessToken: string
  refreshToken: string
}

const ACCESS_TOKEN_KEY = 'hermes.mobile.access-token'
const REFRESH_TOKEN_KEY = 'hermes.mobile.refresh-token'
const LAN_SESSION_TOKEN_KEY = 'hermes.mobile.lan-session-token'

export interface MobileCredentialStore {
  clear(): Promise<void>
  read(): Promise<MobileTokenPair | null>
  readLanSessionToken(): Promise<string | null>
  save(tokens: MobileTokenPair): Promise<void>
  saveLanSessionToken(token: string): Promise<void>
}

export function createMobileCredentialStore(nativeStore: NativeCredentialStore): MobileCredentialStore {
  return {
    async save(tokens: MobileTokenPair): Promise<void> {
      await nativeStore.set(ACCESS_TOKEN_KEY, tokens.accessToken)
      await nativeStore.set(REFRESH_TOKEN_KEY, tokens.refreshToken)
    },
    async read(): Promise<MobileTokenPair | null> {
      const [accessToken, refreshToken] = await Promise.all([
        nativeStore.get(ACCESS_TOKEN_KEY),
        nativeStore.get(REFRESH_TOKEN_KEY)
      ])

      if (accessToken && refreshToken) {
        return { accessToken, refreshToken }
      }

      await Promise.all([nativeStore.remove(ACCESS_TOKEN_KEY), nativeStore.remove(REFRESH_TOKEN_KEY)])

      return null
    },
    async saveLanSessionToken(token: string): Promise<void> {
      await nativeStore.set(LAN_SESSION_TOKEN_KEY, token)
    },
    async readLanSessionToken(): Promise<string | null> {
      return nativeStore.get(LAN_SESSION_TOKEN_KEY)
    },
    async clear(): Promise<void> {
      await Promise.all([
        nativeStore.remove(ACCESS_TOKEN_KEY),
        nativeStore.remove(REFRESH_TOKEN_KEY),
        nativeStore.remove(LAN_SESSION_TOKEN_KEY)
      ])
    }
  }
}
