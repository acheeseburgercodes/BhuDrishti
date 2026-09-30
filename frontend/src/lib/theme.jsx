import { createContext, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Light/dark theme. Defaults to the OS preference ("system"); an explicit choice is stored
 * in localStorage and applied as `html[data-theme]` (index.html applies it before first
 * paint to avoid a flash). Shared by the landing page and the operator portal.
 */
export const THEME_KEY = 'bhudrishti.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const META_COLOR = { light: '#f6f4ef', dark: '#0d1617' }

const readStored = () => {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}
const systemDark = () => Boolean(window.matchMedia?.(DARK_QUERY).matches)

const ThemeContext = createContext({ theme: 'system', resolved: 'light', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStored)
  const [osDark, setOsDark] = useState(systemDark)

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY)
    if (!mq) return undefined
    const on = () => setOsDark(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  const resolved = theme === 'system' ? (osDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, theme)
    } catch { /* storage unavailable: theme still applies for this visit */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[resolved])
  }, [theme, resolved])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

/** Icon button that switches between light and dark and remembers the choice. */
export function ThemeToggle({ labels = {}, size = 'size-11', className = '' }) {
  const { resolved, setTheme } = useTheme()
  const dark = resolved === 'dark'
  const label = dark ? (labels.toLight || 'Switch to light theme') : (labels.toDark || 'Switch to dark theme')
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={label} title={label}
      className={`grid ${size} shrink-0 place-items-center rounded-xl border border-line bg-raised text-ink transition-colors hover:border-accent/50 hover:text-accent ${className}`}>
      {dark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  )
}
