import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The real portal opens WebSockets and MapLibre; a stub is enough to prove routing.
vi.mock('./Portal.jsx', () => ({ default: ({ initialTab }) => <p>Portal stub: {initialTab}</p> }))
window.scrollTo = () => {} // not implemented in jsdom

const { default: App } = await import('./App.jsx')

const go = (hash) => act(() => {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
})

afterEach(() => { cleanup(); window.location.hash = '' })

describe('app routing', () => {
  it('shows the homepage by default with a link into the portal', async () => {
    window.location.hash = ''
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /Community sensing/ })).toBeTruthy()
    const links = screen.getAllByRole('link', { name: /Open (the )?(operator )?portal/ })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].getAttribute('href')).toBe('#overview')
  })

  it('opens deep links such as #agents and #map in the portal', async () => {
    window.location.hash = '#agents'
    render(<App />)
    expect(await screen.findByText('Portal stub: agents')).toBeTruthy()
  })

  it('switches between homepage and portal on hash change', async () => {
    window.location.hash = ''
    render(<App />)
    await screen.findByRole('heading', { level: 1 })
    go('#map')
    expect(await screen.findByText(/Portal stub/)).toBeTruthy()
    go('#home')
    expect(await screen.findByRole('heading', { level: 1, name: /Community sensing/ })).toBeTruthy()
  })
})
