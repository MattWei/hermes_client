import './styles.css'
import './ipad-shell.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { IpadHome } from './ipad-home'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IpadHome />
  </StrictMode>
)
