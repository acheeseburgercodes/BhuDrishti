import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../lib/i18n.jsx'
import { ThemeProvider } from '../lib/theme.jsx'
import { COPY } from './copy.js'
import HomePage, { SECTIONS } from './HomePage.jsx'

const json = (body) => ({ ok: true, status: 200, json: async () => body })
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

/** Mock the three public endpoints NetworkStatus reads. */
function mockApi({ mode = 'live', nodes, pending = [] } = {}) {
  const fn = vi.fn(async (url) => {
    if (url.includes('/api/health')) return json({ ok: true, mode })
    if (url.includes('/api/nodes')) return json(nodes)
    if (url.includes('/api/alerts')) return json(pending)
    throw new Error(`unexpected ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const offlineApi = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

const NODES = [
  { id: 'A', last_seen: minutesAgo(1) },
  { id: 'B', last_seen: minutesAgo(5) },
  { id: 'C', last_seen: minutesAgo(30) },
  { id: 'D', last_seen: minutesAgo(180) },
]

const renderPage = (props) => render(<ThemeProvider><LanguageProvider><HomePage {...props} /></LanguageProvider></ThemeProvider>)
const badge = () => screen.getByTestId('status-badge')

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('landing page content', () => {
  it('explains the product and covers every required topic', async () => {
    offlineApi()
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /Community sensing/ })).toBeTruthy()
    for (const name of [/Two independent sensor layers/, /can and cannot see/, /A person decides/, /reader’s language/, /What BhuDrishti is not/, /Common questions/]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    const note = screen.getByRole('note')
    expect(note.textContent).toMatch(/NDRRMA, DHM/)
    expect(within(note).getByRole('link', { name: /BIPAD/ }).getAttribute('href')).toBe('https://bipad.gov.np')
    expect(within(note).getByRole('link', { name: /Hydrology/ }).getAttribute('rel')).toMatch(/noopener/)
    await screen.findByText('API offline')
  })

  it('points CTAs at real routes and keeps portal deep links', async () => {
    offlineApi()
    renderPage()
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')
    expect(within(hero).getByRole('link', { name: /Open the live map/ }).getAttribute('href')).toBe('#map')
    expect(within(hero).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how-it-works')
    expect(within(hero).getByRole('link', { name: 'Operator portal' }).getAttribute('href')).toBe('#overview')
    expect(screen.getByRole('link', { name: /Open the live coverage map/ }).getAttribute('href')).toBe('#map')
    expect(screen.getByRole('link', { name: /alert review queue/ }).getAttribute('href')).toBe('#alerts')
    expect(screen.getByRole('link', { name: /Open agents in the portal/ }).getAttribute('href')).toBe('#agents')
    const footer = screen.getByRole('navigation', { name: 'Portal shortcuts' })
    for (const [name, href] of [['Overview', '#overview'], ['Coverage map', '#map'], ['Alert review', '#alerts'], ['Agents', '#agents'], ['Devices', '#devices'], ['Phone capture', '#capture']]) {
      expect(within(footer).getByRole('link', { name }).getAttribute('href')).toBe(href)
    }
    for (const s of SECTIONS) expect(document.getElementById(s.id)).toBeTruthy()
    await screen.findByText('API offline')
  })
})

describe('network status', () => {
  it('shows live figures from the API', async () => {
    const fetch = mockApi({ mode: 'live', nodes: NODES, pending: [{ id: 'a1' }, { id: 'a2' }] })
    renderPage()
    expect(screen.getByText('Checking the BhuDrishti API…')).toBeTruthy()
    await waitFor(() => expect(badge().textContent).toBe('Live data'))
    expect(screen.getByText('2 of 4 in the last 15 min')).toBeTruthy()
    expect(screen.getByText('drafts waiting for an operator')).toBeTruthy()
    const pending = screen.getByText('Alerts awaiting review').closest('div')
    expect(within(pending).getByText('2')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/alerts?status=pending_approval'), expect.anything())
  })

  it('labels demo mode when the API runs without a database', async () => {
    mockApi({ mode: 'demo', nodes: NODES })
    renderPage()
    await waitFor(() => expect(badge().textContent).toBe('Demo mode'))
    expect(screen.getByText(/running without a database/)).toBeTruthy()
  })

  it('falls back to the labelled fixture when the API is unreachable, and can retry', async () => {
    offlineApi()
    renderPage()
    await waitFor(() => expect(badge().textContent).toBe('API offline'))
    expect(screen.getByText(/bundled demo fixture, not live readings/)).toBeTruthy()
    expect(screen.getByText('unavailable offline')).toBeTruthy()
    // Seed fixture: 7 nodes, 5 reported within 15 min, BD-005 silent for 2 h.
    expect(screen.getByText('5 of 7 in the last 15 min')).toBeTruthy()

    const fetch = mockApi({ mode: 'live', nodes: NODES })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(badge().textContent).toBe('Live data'))
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})

describe('landing interactions', () => {
  it('opens and closes the mobile menu (button, Escape, link)', async () => {
    offlineApi()
    renderPage()
    const button = screen.getByRole('button', { name: 'Open menu' })
    const menu = document.getElementById('site-menu')
    expect(menu.hidden).toBe(true)
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(menu.hidden).toBe(false)
    expect(button.textContent).toMatch('Close menu')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu.hidden).toBe(true)
    expect(document.activeElement).toBe(button)

    fireEvent.click(button)
    fireEvent.click(within(menu).getByRole('link', { name: 'FAQ' }))
    expect(menu.hidden).toBe(true)
    fireEvent.click(button)
    fireEvent.pointerDown(document.body)
    expect(menu.hidden).toBe(true)
    await screen.findByText('API offline')
  })

  it('switches the whole page language through the shared provider', async () => {
    offlineApi()
    renderPage()
    const select = screen.getAllByRole('combobox', { name: 'Language' })[0]
    fireEvent.change(select, { target: { value: 'ne' } })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(COPY.ne.hero.title)
    expect(screen.getByRole('link', { name: COPY.ne.hero.ctaMap }).getAttribute('href')).toBe('#map')
    expect(screen.getByRole('heading', { level: 2, name: COPY.ne.faq.title })).toBeTruthy()
    expect(localStorage.getItem('bhudrishti.lang')).toBe('ne')
    expect(document.documentElement.lang).toBe('ne')
    expect(document.title).toBe(COPY.ne.meta.title)
    // Notice preview follows the interface language.
    expect(screen.getByTestId('notice-advisory').textContent).toMatch('स्याफ्रुबेसी')

    fireEvent.change(screen.getAllByRole('combobox', { name: COPY.ne.header.language })[0], { target: { value: 'hi' } })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(COPY.hi.hero.title)
    await waitFor(() => expect(badge().textContent).toBe(COPY.hi.status.offline))
  })

  it('toggles and remembers the theme', async () => {
    offlineApi()
    renderPage()
    const toggle = screen.getAllByRole('button', { name: 'Switch to dark theme' })[0]
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('bhudrishti.theme')).toBe('dark')
    fireEvent.click(screen.getAllByRole('button', { name: 'Switch to light theme' })[0])
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('bhudrishti.theme')).toBe('light')
    await screen.findByText('API offline')
  })

  it('runs coverage scenarios with the shared model (click and arrow keys)', async () => {
    offlineApi()
    renderPage()
    const group = screen.getByRole('radiogroup', { name: 'Coverage scenario' })
    const map = () => screen.getByRole('img', { name: /Coverage preview/ }).getAttribute('aria-label')
    const before = map()
    fireEvent.click(within(group).getByRole('radio', { name: 'With phones' }))
    expect(map()).toMatch(/With phones/)
    expect(map()).not.toBe(before)
    fireEvent.keyDown(within(group).getByRole('radio', { name: 'With phones' }), { key: 'ArrowRight' })
    const silent = within(group).getByRole('radio', { name: 'Two nodes silent' })
    expect(silent.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(silent)
    expect(map()).toMatch(/Two nodes silent/)
    await screen.findByText('API offline')
  })

  it('previews notices in each language without changing the interface language', async () => {
    offlineApi()
    renderPage()
    const group = screen.getByRole('radiogroup', { name: 'Preview language' })
    fireEvent.click(within(group).getByRole('radio', { name: 'हिन्दी' }))
    expect(screen.getByTestId('notice-advisory').getAttribute('lang')).toBe('hi')
    expect(screen.getByTestId('notice-advisory').textContent).toMatch(/असामान्य कंपन/)
    expect(screen.getByRole('heading', { level: 1, name: /Community sensing/ })).toBeTruthy()
    await screen.findByText('API offline')
  })

  it('expands FAQ answers independently and moves focus with arrow keys', async () => {
    offlineApi()
    renderPage()
    const [q1, q2] = COPY.en.faq.items
    const b1 = screen.getByRole('button', { name: q1[0] })
    const b2 = screen.getByRole('button', { name: q2[0] })
    expect(b1.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(b1)
    fireEvent.click(b2)
    expect(b1.getAttribute('aria-expanded')).toBe('true')
    expect(b2.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(b1.getAttribute('aria-controls')).hidden).toBe(false)
    fireEvent.click(b1)
    expect(document.getElementById(b1.getAttribute('aria-controls')).hidden).toBe(true)
    b1.focus()
    fireEvent.keyDown(b1, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(b2)
    await screen.findByText('API offline')
  })

  it('moves focus to a section named in the hash, including old aliases', async () => {
    offlineApi()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    Element.prototype.scrollIntoView = () => {}
    renderPage({ section: 'problem' })
    await act(async () => { vi.runOnlyPendingTimers() })
    vi.useRealTimers()
    expect(document.activeElement.id).toBe('how-it-works')
    await screen.findByText('API offline')
  })
})
