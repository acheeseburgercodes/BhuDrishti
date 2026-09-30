import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real portal opens WebSockets and MapLibre; a stub is enough to prove routing.
vi.mock('./Portal.jsx', () => ({ default: ({ initialTab }) => <p>Portal stub: {initialTab}</p> }))
window.scrollTo = () => {} // not implemented in jsdom

const { default: App } = await import('./App.jsx')
const { PORTAL_TABS } = await import('./lib/route.js')

const go = (hash) => act(() => {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
})

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') })) })
afterEach(() => { cleanup(); window.location.hash = ''; vi.unstubAllGlobals() })

describe('app routing', () => {
  it('shows the landing page by default with links into the portal and map', async () => {
    window.location.hash = ''
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /Community sensing/ })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Operator portal/ })[0].getAttribute('href')).toBe('#overview')
    expect(screen.getAllByRole('link', { name: /live map/i })[0].getAttribute('href')).toBe('#map')
    await screen.findByText('API offline')
  })

  it('opens every portal deep link in the portal', async () => {
    for (const tab of PORTAL_TABS) {
      window.location.hash = `#${tab}`
      render(<App />)
      expect(await screen.findByText(`Portal stub: ${tab}`)).toBeTruthy()
      cleanup()
    }
  })

  it('switches between landing page and portal on hash change', async () => {
    window.location.hash = ''
    render(<App />)
    await screen.findByRole('heading', { level: 1 })
    go('#map')
    expect(await screen.findByText(/Portal stub/)).toBeTruthy()
    go('#home')
    expect(await screen.findByRole('heading', { level: 1, name: /Community sensing/ })).toBeTruthy()
    go('#faq')
    expect(await screen.findByRole('heading', { level: 2, name: /Common questions/ })).toBeTruthy()
  })
})
