import './styles.css'
import './ipad-shell.css'

import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

import { IpadHome } from './ipad-home'

/**
 * Pin the shell to the *visual* viewport.
 *
 * `dvh`/`svh` follow the browser's own chrome, not the keyboard: when iOS raises the keyboard the visual
 * viewport shrinks while the layout viewport keeps its old height, so a shell sized in dvh or svh stays
 * full height and the system scrolls the page to reach the focused composer — which pushes the header
 * and the transcript off the top of the screen. Handing `visualViewport.height` to CSS keeps the shell
 * inside what is actually visible: the transcript gives up the space, the header stays put, nothing
 * scrolls.
 */
function useVisualViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    const apply = () =>
      root.style.setProperty('--app-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`)
    apply()
    viewport?.addEventListener('resize', apply)
    viewport?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      viewport?.removeEventListener('resize', apply)
      viewport?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])
}

function MobileRoot() {
  useVisualViewportHeight()
  return <IpadHome />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileRoot />
  </StrictMode>
)
