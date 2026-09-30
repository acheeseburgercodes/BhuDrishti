import { describe, expect, it } from 'vitest'
import { PORTAL_TABS, parseRoute, portalHref } from './route.js'

describe('parseRoute', () => {
  it('keeps every existing portal deep link on the portal', () => {
    for (const tab of PORTAL_TABS) expect(parseRoute(`#${tab}`)).toEqual({ view: 'portal', tab })
    expect(parseRoute('#agents')).toEqual({ view: 'portal', tab: 'agents' })
    expect(parseRoute('#map')).toEqual({ view: 'portal', tab: 'map' })
  })

  it('treats #portal and #dashboard as the portal overview', () => {
    expect(parseRoute('#portal')).toEqual({ view: 'portal', tab: 'overview' })
    expect(parseRoute('#dashboard')).toEqual({ view: 'portal', tab: 'overview' })
  })

  it('renders the homepage for empty, #home and section hashes', () => {
    expect(parseRoute('')).toEqual({ view: 'home', section: null })
    expect(parseRoute('#home')).toEqual({ view: 'home', section: null })
    expect(parseRoute('#how-it-works')).toEqual({ view: 'home', section: 'how-it-works' })
    expect(parseRoute('#alert-workflow')).toEqual({ view: 'home', section: 'alert-workflow' })
  })

  it('builds portal hrefs', () => {
    expect(portalHref()).toBe('#overview')
    expect(portalHref('agents')).toBe('#agents')
  })
})
