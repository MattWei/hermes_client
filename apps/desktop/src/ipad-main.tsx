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
    const apply = () => {
      root.style.setProperty('--app-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`)
      // iOS scrolls the page to reveal a focused field *before* the shell has shrunk, and that scroll
      // survives the resize — leaving the composer stranded at the top with the rest of the page blank.
      // Only the connected shell (a fixed-height surface that never needs document scrolling) is reset;
      // the connection form keeps its own scroll position. The second pass covers iOS scrolling *after*
      // the keyboard finishes animating, when no further event reaches us.
      const pinToTop = () => {
        if (!document.querySelector('[data-app-shell]')) return
        window.scrollTo(0, 0)
        window.setTimeout(() => window.scrollTo(0, 0), 120)
      }
      pinToTop()
    }
    apply()
    viewport?.addEventListener('resize', apply)
    viewport?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)
    document.addEventListener('focusin', apply)
    return () => {
      viewport?.removeEventListener('resize', apply)
      viewport?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
      document.removeEventListener('focusin', apply)
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
