import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

const legacy = window.location.hash === '#legacy'
// Legacy styles are global and would clash with Tailwind, so load one UI or the other.
const Root = legacy ? lazy(() => import('./legacy/LegacyApp.jsx')) : lazy(() => import('./App.jsx'))
if (!legacy) import('./index.css')

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<p style={{ padding: 24, fontFamily: 'system-ui' }}>Loading BhuDrishti…</p>}>
      <Root />
    </Suspense>
  </React.StrictMode>,
)

window.addEventListener('hashchange', (event) => {
  if (event.newURL.endsWith('#legacy') !== legacy) window.location.reload()
})
