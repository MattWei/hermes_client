import { Capacitor, CapacitorHttp } from '@capacitor/core'

import { filePathFromMediaPath, mediaMime, setMobileMediaLoader } from '@/lib/media'

import type { MobileConnectionMode } from './mobile-connection'

/**
 * Playing a gateway file on a phone.
 *
 * The desktop player works because Electron proxies the file through a custom protocol. A WebView has no
 * such bridge: a gateway path becomes `file://…`, which iOS cannot load, so an `<audio>` renders a broken
 * player. The bytes are reachable the same way every other mobile call reaches the backend — over the
 * authenticated connection — so the file is fetched through the native HTTP layer and handed back as an
 * object URL.
 *
 * Fetched whole rather than streamed: `CapacitorHttp` returns a buffered body, and these are the small
 * files a conversation produces (a clip, a voice note). A seekable blob is what the `<audio>` element needs.
 */
export interface MobileMediaSource {
  baseUrl: string
  mode: MobileConnectionMode
  /** LAN connections authenticate with a header; secure ones ride the dashboard session cookie. */
  token?: string
}

interface NativeHttpResponse {
  data: unknown
  headers: Record<string, string>
  status: number
}

export interface MobileMediaRuntime {
  createObjectURL(blob: Blob): string
  fetchBlob(url: string, headers: Record<string, string>): Promise<{ blob: Blob, status: number }>
  isNativePlatform(): boolean
  nativeGet(options: {
    headers: Record<string, string>
    responseType: 'arraybuffer'
    url: string
  }): Promise<NativeHttpResponse>
}

const capacitorRuntime: MobileMediaRuntime = {
  createObjectURL: blob => URL.createObjectURL(blob),
  async fetchBlob(url, headers) {
    const response = await fetch(url, { headers })

    return { blob: await response.blob(), status: response.status }
  },
  isNativePlatform: () => Capacitor.isNativePlatform(),
  nativeGet: options => CapacitorHttp.get(options)
}

/** The gateway route that serves a file inline with Range support. */
export function mobileMediaUrl(source: MobileMediaSource, path: string): string {
  return `${source.baseUrl}/api/files/stream?path=${encodeURIComponent(filePathFromMediaPath(path))}`
}

function mediaHeaders(source: MobileMediaSource): Record<string, string> {
  return source.mode === 'lan' && source.token ? { 'X-Hermes-Session-Token': source.token } : {}
}

export function createMobileMediaLoader(
  source: MobileMediaSource,
  runtime: MobileMediaRuntime = capacitorRuntime
): (path: string) => Promise<string> {
  return async (path: string) => {
    const url = mobileMediaUrl(source, path)
    const headers = mediaHeaders(source)

    if (!runtime.isNativePlatform()) {
      const { blob, status } = await runtime.fetchBlob(url, headers)

      if (!status || status >= 400) {
        throw new Error(`Unable to fetch ${path} (HTTP ${status})`)
      }

      return runtime.createObjectURL(blob)
    }

    const response = await runtime.nativeGet({ headers, responseType: 'arraybuffer', url })

    if (response.status >= 400) {
      throw new Error(`Unable to fetch ${path} (HTTP ${response.status})`)
    }

    // The gateway sets the real content type; falling back to the extension keeps the blob recognisable
    // when a proxy strips the header.
    const type = response.headers['content-type'] || response.headers['Content-Type'] || mediaMime(path)
    const bytes = response.data instanceof ArrayBuffer
      ? response.data
      : new Uint8Array(typeof response.data === 'string' ? [] : (response.data as ArrayLike<number>))

    return runtime.createObjectURL(new Blob([bytes], { type }))
  }
}

/** Install or clear the loader the shared media layer consults for gateway paths. */
export function installMobileMediaLoader(source: null | MobileMediaSource): void {
  setMobileMediaLoader(source ? createMobileMediaLoader(source) : null)
}
