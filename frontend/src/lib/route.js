import { useEffect, useState } from 'react'

/**
 * Hash routing. Portal tab hashes (#overview, #map, #agents …) are the existing deep links
 * and must keep opening the operator portal. `#portal` / `#dashboard` are aliases for the
 * portal overview. Everything else (empty hash, #home, or a homepage section id such as
 * #how-it-works) renders the public homepage. `#legacy` is handled in main.jsx.
 */
export const PORTAL_TABS = ['overview', 'map', 'events', 'devices', 'alerts', 'agents', 'capture', 'settings']
const PORTAL_ALIASES = ['portal', 'dashboard']

export function parseRoute(hash = '') {
  let raw = String(hash).replace(/^#\/?/, '')
  try { raw = decodeURIComponent(raw) } catch { /* keep raw */ }
  if (PORTAL_TABS.includes(raw)) return { view: 'portal', tab: raw }
  if (PORTAL_ALIASES.includes(raw)) return { view: 'portal', tab: 'overview' }
  return { view: 'home', section: raw && raw !== 'home' ? raw : null }
}

export const portalHref = (tab = 'overview') => `#${tab}`
export const HOME_HREF = '#home'

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

/** Focus and scroll to an element without changing the hash (keeps routing stable). */
export function focusTarget(id) {
  const el = document.getElementById(id)
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  el.scrollIntoView?.({ block: 'start', behavior: 'instant' })
}
