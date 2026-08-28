import './styles.css'
// Side-effect: reports in-flight turns to the main process for the quit guard.
import './store/active-work'
// Side-effect: mirrors the machine's AC/battery state for poll demotion.
import './store/power'
// Side-effect: applies the persisted window translucency on load.
import './store/translucency'
import '@/debug/dev-only'

import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'

import App from './app'
import { RootErrorBoundary } from './components/error-boundary'
import { HapticsProvider } from './components/haptics-provider'
import { RootTooltipProvider } from './components/ui/tooltip'
import { I18nProvider } from './i18n'
import { installClipboardShim } from './lib/clipboard'
import { queryClient } from './lib/query-client'
import { installRendererAnimationPauseState } from './lib/renderer-loop-pause'
import { installSelectionCopyColorGuard } from './lib/selection-copy-colors'
import { ThemeProvider } from './themes/context'

installClipboardShim()
installSelectionCopyColorGuard()

if (import.meta.env.MODE !== 'production' || import.meta.env.VITE_PERF_PROBE === '1') {
  import('./app/chat/perf-probe')
}

const winParam = new URLSearchParams(window.location.search).get('win')

if (winParam === 'hud') {
  document.title = 'Hermes HUD'
}

if (winParam === 'overlay') {
  void import('./app/pet-overlay/overlay-root').then(({ mountPetOverlay }) => mountPetOverlay())
} else if (winParam === 'quick') {
  void import('./app/quick-entry/quick-entry-root').then(({ mountQuickEntry }) => mountQuickEntry())
} else if (winParam === 'wake') {
  void import('./app/wake-indicator/wake-indicator-root').then(({ mountWakeIndicator }) => mountWakeIndicator())
} else {
  installRendererAnimationPauseState()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <ThemeProvider>
              <HapticsProvider>
                <RootTooltipProvider>
                  <HashRouter useTransitions={false}>
                    <App />
                  </HashRouter>
                </RootTooltipProvider>
              </HapticsProvider>
            </ThemeProvider>
          </I18nProvider>
        </QueryClientProvider>
      </RootErrorBoundary>
    </StrictMode>
  )
}
