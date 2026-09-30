import { Suspense, lazy, useEffect, useRef } from 'react'
import { LanguageProvider } from './lib/i18n.jsx'
import { useRoute } from './lib/route.js'

// Split so the public homepage never downloads MapLibre / live-data code until the portal opens.
const HomePage = lazy(() => import('./home/HomePage.jsx'))
const Portal = lazy(() => import('./Portal.jsx'))

function Loading({ label }) {
  return <p role="status" className="p-6 text-sm text-muted">{label}</p>
}

export function Router() {
  const route = useRoute()
  const previous = useRef(route.view)
  useEffect(() => {
    if (previous.current !== route.view) window.scrollTo?.(0, 0)
    previous.current = route.view
  }, [route.view])

  if (route.view === 'portal') {
    return <Suspense fallback={<Loading label="Loading operator portal…" />}><Portal initialTab={route.tab} /></Suspense>
  }
  return <Suspense fallback={<Loading label="Loading BhuDrishti…" />}><HomePage section={route.section} /></Suspense>
}

export default function App() {
  return <LanguageProvider><Router /></LanguageProvider>
}
