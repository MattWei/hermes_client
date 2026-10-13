export interface NativeCredentialStore {
  get(key: string): Promise<string | null>
  remove(key: string): Promise<void>
  set(key: string, value: string): Promise<void>
}

export interface MobileTokenPair {
  accessToken: string
  refreshToken: string
}

export interface MobileAutoLoginCredentials {
  baseUrl: string
  password: string
  username: string
}

const ACCESS_TOKEN_KEY = 'hermes.mobile.access-token'
const REFRESH_TOKEN_KEY = 'hermes.mobile.refresh-token'
const LAN_SESSION_TOKEN_KEY = 'hermes.mobile.lan-session-token'
const AUTO_LOGIN_KEY = 'hermes.mobile.auto-login'

export interface MobileCredentialStore {
  clear(): Promise<void>
  clearAutoLogin(): Promise<void>
  read(): Promise<MobileTokenPair | null>
  readAutoLogin(): Promise<MobileAutoLoginCredentials | null>
  readLanSessionToken(): Promise<string | null>
  save(tokens: MobileTokenPair): Promise<void>
  saveAutoLogin(credentials: MobileAutoLoginCredentials): Promise<void>
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
      await Promise.all([
        nativeStore.remove(ACCESS_TOKEN_KEY),
        nativeStore.remove(REFRESH_TOKEN_KEY)
      ])
      return null
    },
    async saveLanSessionToken(token: string): Promise<void> {
      await nativeStore.set(LAN_SESSION_TOKEN_KEY, token)
    },
    async readLanSessionToken(): Promise<string | null> {
      return nativeStore.get(LAN_SESSION_TOKEN_KEY)
    },
    /**
     * Auto-login keeps the credential so the next launch can sign in unattended. It is stored
     * only when the person ticks the box, and removing it is an explicit action too — a stored
     * password that outlives its opt-in is the failure mode worth designing against here.
     */
    async saveAutoLogin(credentials: MobileAutoLoginCredentials): Promise<void> {
      await nativeStore.set(AUTO_LOGIN_KEY, JSON.stringify(credentials))
    },
    async readAutoLogin(): Promise<MobileAutoLoginCredentials | null> {
      const raw = await nativeStore.get(AUTO_LOGIN_KEY)
      if (!raw) {
        return null
      }
      try {
        const parsed = JSON.parse(raw) as Partial<MobileAutoLoginCredentials>
        if (typeof parsed.baseUrl === 'string' && typeof parsed.password === 'string' && typeof parsed.username === 'string') {
          return { baseUrl: parsed.baseUrl, password: parsed.password, username: parsed.username }
        }
      } catch {
        // Malformed entry: fall through to the cleanup below rather than failing every launch.
      }
      await nativeStore.remove(AUTO_LOGIN_KEY)
      return null
    },
    async clearAutoLogin(): Promise<void> {
      await nativeStore.remove(AUTO_LOGIN_KEY)
    },
    async clear(): Promise<void> {
      await Promise.all([
        nativeStore.remove(ACCESS_TOKEN_KEY),
        nativeStore.remove(REFRESH_TOKEN_KEY),
        nativeStore.remove(LAN_SESSION_TOKEN_KEY),
        nativeStore.remove(AUTO_LOGIN_KEY)
      ])
    }
  }
}
