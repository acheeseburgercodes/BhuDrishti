import { describe, expect, it } from 'vitest'
import { initialLiveState, isDemo, liveReducer } from './liveState.js'

const ev = (id, t, extra = {}) => ({ id, node_id: 'BD-001', node_name: 'Gate', lat: 28, lng: 85, recorded_at: t, source: 'esp32_node', classification: { classification: 'normal', confidence: 0.9, features: {} }, telemetry: { battery_pct: 70 }, ...extra })

describe('liveReducer', () => {
  it('orders telemetry newest first, de-duplicates, and updates node freshness', () => {
    let s = liveReducer({ ...initialLiveState, nodes: [{ id: 'BD-001', name: 'Gate', status: 'online' }] }, { type: 'telemetry', event: ev('a', '2026-09-30T06:00:00Z') })
    s = liveReducer(s, { type: 'telemetry', event: ev('b', '2026-09-30T05:59:00Z') })
    s = liveReducer(s, { type: 'telemetry', event: ev('a', '2026-09-30T06:00:00Z') })
    expect(s.events.map((e) => e.id)).toEqual(['a', 'b'])
    // The older reading (b) arrived later but must not move last_seen backwards.
    expect(s.nodes[0].last_seen).toBe('2026-09-30T06:00:00Z')
    expect(s.nodes[0].battery_pct).toBe(70)
  })

  it('registers unseen phone devices from telemetry and marks critical on events', () => {
    const s = liveReducer(initialLiveState, { type: 'telemetry', event: ev('p', '2026-09-30T06:00:00Z', { node_id: 'PH-1', source: 'phone_layer', classification: { classification: 'event' } }) })
    expect(s.nodes[0]).toMatchObject({ id: 'PH-1', kind: 'phone', status: 'critical' })
  })

  it('upserts alerts by id', () => {
    let s = liveReducer(initialLiveState, { type: 'alert', alert: { id: 'x', status: 'pending_approval' } })
    s = liveReducer(s, { type: 'alert', alert: { id: 'x', status: 'approved' } })
    expect(s.alerts).toEqual([{ id: 'x', status: 'approved' }])
  })

  it('treats fixture data and non-live backends as demo', () => {
    expect(isDemo({ ...initialLiveState, dataOrigin: 'fixture', config: { mode: 'live' } })).toBe(true)
    expect(isDemo({ ...initialLiveState, dataOrigin: 'api', config: { mode: 'demo' } })).toBe(true)
    expect(isDemo({ ...initialLiveState, dataOrigin: 'api', config: { mode: 'live' } })).toBe(false)
  })
})
