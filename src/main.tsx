import { Component, StrictMode, lazy, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

// Sanat önizlemesi yalnızca geliştirmede: #/art
const ArtPreview = lazy(() => import('./screens/ArtPreview').then(m => ({ default: m.ArtPreview })))
const showArt = import.meta.env.DEV && window.location.hash === '#/art'

/** Beklenmeyen bir çizim hatasında beyaz ekran yerine yeniden deneme */
class Guard extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div className="panel p-6 space-y-4 max-w-[360px]">
          <div className="font-pixel text-3xl text-gold">Hay aksi!</div>
          <p className="font-pixel text-lg text-ink2">Bir şey ters gitti. İlerlemen güvende.</p>
          <button className="pbtn pbtn-gold w-full text-xl" onClick={() => window.location.reload()}>Yeniden dene</button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard>{showArt ? <Suspense><ArtPreview /></Suspense> : <App />}</Guard>
  </StrictMode>,
)
