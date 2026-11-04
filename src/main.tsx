import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

// Sanat önizlemesi yalnızca geliştirmede: #/art
const ArtPreview = lazy(() => import('./screens/ArtPreview').then(m => ({ default: m.ArtPreview })))
const showArt = import.meta.env.DEV && window.location.hash === '#/art'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showArt ? <Suspense><ArtPreview /></Suspense> : <App />}
  </StrictMode>,
)
