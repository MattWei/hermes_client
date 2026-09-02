import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.nousresearch.hermes.client',
  appName: 'Hermes',
  android: {
    allowMixedContent: true
  },
  server: {
    androidScheme: 'http'
  },
  webDir: 'dist'
}

export default config
