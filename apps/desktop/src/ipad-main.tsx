import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { IpadHome } from './ipad-home'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IpadHome />
  </StrictMode>
)
