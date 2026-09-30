import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventBadges, EventDetail } from './EventFeed.jsx'

const base = {
  id: 'e1', node_id: 'BD-002', node_name: 'Syabrubesi', recorded_at: '2026-09-30T06:00:00Z', source: 'phone_layer', channel: 'mobile_app',
  transport: 'wifi_softap', queued: true, attempt: 3, demo: true, alert_confidence: 0.82,
  classification: { classification: 'event', confidence: 0.9, features: { peak_amplitude: 1.2, dominant_frequency_hz: 18 } },
  quality: { score: 0.8, flags: ['clipping'] }, cross_confirmation: { cross_confirmed: true, sources: ['esp32_node', 'phone_layer'], window_s: 30 },
  telemetry: { sensor_window: [0, 1, -1, 0.5] },
}

describe('event presentation', () => {
  it('labels source, confirmation, queue replay, demo and quality flags', () => {
    render(<EventBadges event={base} />)
    for (const text of ['Vibration event', 'Phone', 'Cross-confirmed', 'Replayed from queue', 'Demo', 'clipping']) expect(screen.getByText(text)).toBeTruthy()
  })

  it('shows provenance and confidence in detail view', () => {
    render(<EventDetail event={base} now={Date.parse('2026-09-30T06:01:00Z')} />)
    expect(screen.getByText('Phone sensor · via mobile app')).toBeTruthy()
    expect(screen.getByText('82%')).toBeTruthy()
    expect(screen.getByText(/attempt 3/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Sensor window: 4 samples/ })).toBeTruthy()
  })
})
