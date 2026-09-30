/**
 * Wire contracts shared by the web dashboard, the mobile app and (by mirroring) the
 * FastAPI backend (`backend/contracts.py`). Keep the two in sync; the backend is the
 * authority and re-validates everything.
 */

/** Detection source. Kept to the two values the ESP32 firmware and bridge already emit. */
export const SOURCES = Object.freeze(['esp32_node', 'phone_layer'])

/** How the reading reached the backend. Distinguishes mobile app vs browser vs bridge. */
export const CHANNELS = Object.freeze([
  'esp32_bridge', 'serial_bridge', 'mobile_app', 'web_portal', 'simulator', 'unknown',
])

export const TRANSPORTS = Object.freeze(['wifi_softap', 'ble', 'serial', 'cellular', 'http', 'unknown'])

export const LANGUAGES = Object.freeze([
  { code: 'en', label: 'English', nativeLabel: 'English', sarvam: 'en-IN' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली', sarvam: 'ne-IN' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', sarvam: 'hi-IN' },
])

export const LIMITS = Object.freeze({
  minSamples: 8,
  maxSamples: 2048,
  maxAbsSample: 1000,
  maxFutureSkewMs: 5 * 60 * 1000,
  idPattern: /^[A-Za-z0-9_.:-]{2,64}$/,
})

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Validate a telemetry payload client-side before queueing it. Returns
 * `{ ok, errors }`; the backend performs the same checks authoritatively.
 */
export function validateTelemetry(payload, now = Date.now()) {
  const errors = []
  if (!payload || typeof payload !== 'object') return { ok: false, errors: ['payload must be an object'] }
  if (typeof payload.node_id !== 'string' || !LIMITS.idPattern.test(payload.node_id)) {
    errors.push('node_id must be 2-64 chars of letters, digits, _ . : -')
  }
  if (payload.device_id != null && (typeof payload.device_id !== 'string' || !LIMITS.idPattern.test(payload.device_id))) {
    errors.push('device_id has an invalid format')
  }
  if (!SOURCES.includes(payload.source ?? 'esp32_node')) errors.push(`source must be one of ${SOURCES.join(', ')}`)
  if (payload.channel != null && !CHANNELS.includes(payload.channel)) errors.push('channel is not recognised')
  if (payload.transport != null && !TRANSPORTS.includes(payload.transport)) errors.push('transport is not recognised')
  const window = payload.sensor_window
  if (!Array.isArray(window)) {
    errors.push('sensor_window must be an array')
  } else {
    if (window.length < LIMITS.minSamples) errors.push(`sensor_window needs at least ${LIMITS.minSamples} samples`)
    if (window.length > LIMITS.maxSamples) errors.push(`sensor_window allows at most ${LIMITS.maxSamples} samples`)
    if (!window.every((v) => isFiniteNumber(v) && Math.abs(v) <= LIMITS.maxAbsSample)) {
      errors.push('sensor_window values must be finite numbers within ±1000')
    }
  }
  if (payload.battery_pct != null && !(isFiniteNumber(payload.battery_pct) && payload.battery_pct >= 0 && payload.battery_pct <= 100)) {
    errors.push('battery_pct must be 0-100')
  }
  for (const key of ['recorded_at', 'captured_at']) {
    if (payload[key] == null) continue
    const t = Date.parse(payload[key])
    if (Number.isNaN(t)) errors.push(`${key} must be an ISO-8601 timestamp`)
    else if (t - now > LIMITS.maxFutureSkewMs) errors.push(`${key} is too far in the future`)
  }
  if (payload.client_event_id != null && (typeof payload.client_event_id !== 'string' || !LIMITS.idPattern.test(payload.client_event_id))) {
    errors.push('client_event_id has an invalid format')
  }
  return { ok: errors.length === 0, errors }
}

/** Unique, sortable id for idempotent retries (the backend de-duplicates on it). */
export function makeClientEventId(prefix = 'c', now = Date.now(), random = Math.random) {
  return `${prefix}-${now.toString(36)}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`
}

/** Human label for where a reading came from. */
export function describeSource(event) {
  const source = event?.source === 'phone_layer' ? 'Phone sensor' : 'ESP32 node'
  const channel = {
    esp32_bridge: 'via ESP32 bridge',
    serial_bridge: 'via serial bridge',
    mobile_app: 'via mobile app',
    web_portal: 'via web portal',
    simulator: 'simulated',
  }[event?.channel] || ''
  return channel ? `${source} · ${channel}` : source
}
