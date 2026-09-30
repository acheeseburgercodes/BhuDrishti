import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  OfflineQueue, computeBackoff, computeCoverage, describeSource, freshnessState, isPermanentStatus,
  makeClientEventId, memoryStorage, translate, validateTelemetry, STRINGS,
} from '../src/index.js'

const model = JSON.parse(readFileSync(new URL('../fixtures/coverage-model.json', import.meta.url)))
const parity = JSON.parse(readFileSync(new URL('../fixtures/coverage-parity.json', import.meta.url)))
const window = Array.from({ length: 160 }, (_, i) => Math.sin(i / 5) * 0.05)

test('validateTelemetry accepts a good payload and rejects bad ones', () => {
  assert.equal(validateTelemetry({ node_id: 'BD-001', sensor_window: window, source: 'phone_layer', channel: 'mobile_app' }).ok, true)
  assert.equal(validateTelemetry({ node_id: 'x', sensor_window: window }).ok, false)
  assert.equal(validateTelemetry({ node_id: 'BD-001', sensor_window: [1, 2] }).ok, false)
  assert.equal(validateTelemetry({ node_id: 'BD-001', sensor_window: [...window.slice(0, 10), Number.NaN] }).ok, false)
  assert.equal(validateTelemetry({ node_id: 'BD-001', sensor_window: window, source: 'drone' }).ok, false)
  const future = new Date(Date.now() + 3600e3).toISOString()
  assert.equal(validateTelemetry({ node_id: 'BD-001', sensor_window: window, recorded_at: future }).ok, false)
})

test('source descriptions differentiate ESP32 and phone channels', () => {
  assert.equal(describeSource({ source: 'esp32_node', channel: 'esp32_bridge' }), 'ESP32 node · via ESP32 bridge')
  assert.equal(describeSource({ source: 'phone_layer', channel: 'mobile_app' }), 'Phone sensor · via mobile app')
  assert.match(makeClientEventId('m', 1000, () => 0.5), /^m-rs-[0-9a-z]{6}$/)
})

test('backoff grows exponentially, is capped and jittered', () => {
  const max = (a) => computeBackoff(a, {}, () => 1)
  assert.equal(max(1), 2000)
  assert.equal(max(3), 8000)
  assert.equal(max(30), 300000)
  assert.equal(computeBackoff(3, {}, () => 0), 4000)
  assert.equal(isPermanentStatus(422), true)
  assert.equal(isPermanentStatus(429), false)
  assert.equal(isPermanentStatus(503), false)
})

test('offline queue persists, retries with backoff and de-duplicates', async () => {
  let now = 0
  const storage = memoryStorage()
  const queue = new OfflineQueue(storage, { now: () => now, random: () => 1 })
  await queue.enqueue({ node_id: 'BD-001', client_event_id: 'c1' })
  await queue.enqueue({ node_id: 'BD-001', client_event_id: 'c1' })
  await queue.enqueue({ node_id: 'BD-001', client_event_id: 'c2' })
  assert.equal(queue.status().pending, 2)

  const offline = async () => { throw new Error('Network request failed') }
  let result = await queue.flush(offline)
  assert.deepEqual(result, { sent: 0, retried: 1, dropped: 0, skipped: false }) // stops after first network failure
  assert.equal(queue.items[0].nextAttemptAt, 2000)

  // Survives a restart
  const reloaded = new OfflineQueue(storage, { now: () => now, random: () => 1 })
  await reloaded.load()
  assert.equal(reloaded.status().pending, 2)
  assert.equal(reloaded.items[0].payload.queued, true)

  now = 1000
  const sent = []
  result = await reloaded.flush(async (p) => sent.push(p.client_event_id))
  assert.deepEqual(sent, ['c2']) // c1 still backing off
  now = 2500
  result = await reloaded.flush(async (p) => sent.push({ id: p.client_event_id, attempt: p.attempt }))
  assert.deepEqual(sent[1], { id: 'c1', attempt: 2 })
  assert.equal(reloaded.status().pending, 0)
})

test('permanent errors and max attempts move items to failed', async () => {
  const queue = new OfflineQueue(memoryStorage(), { now: () => 0, maxAttempts: 2 })
  await queue.enqueue({ client_event_id: 'bad' })
  await queue.enqueue({ client_event_id: 'flaky' })
  const send = async (p) => {
    const error = new Error(p.client_event_id === 'bad' ? 'HTTP 422' : 'HTTP 503')
    error.status = p.client_event_id === 'bad' ? 422 : 503
    error.permanent = p.client_event_id === 'bad'
    throw error
  }
  await queue.flush(send, { force: true })
  await queue.flush(send, { force: true })
  assert.equal(queue.status().pending, 0)
  assert.deepEqual(queue.failed.map((i) => i.id), ['bad', 'flaky'])
})

test('freshness states', () => {
  const now = Date.parse('2026-09-30T06:00:00Z')
  assert.equal(freshnessState('2026-09-30T05:59:30Z', now), 'live')
  assert.equal(freshnessState('2026-09-30T05:50:00Z', now), 'recent')
  assert.equal(freshnessState('2026-09-30T05:30:00Z', now), 'stale')
  assert.equal(freshnessState('2026-09-30T03:00:00Z', now), 'offline')
  assert.equal(freshnessState(null, now), 'never')
})

test('JS coverage matches the Python reference fixture exactly', () => {
  const { input, expected } = parity
  const result = computeCoverage({ nodes: input.nodes, settlements: input.settlements, model, asOf: input.as_of, maxAgeMinutes: input.max_age_minutes })
  const strip = ({ as_of: _ignored, ...rest }) => rest
  assert.deepEqual(strip(result.summary), strip(expected.summary))
  assert.deepEqual(result.features.map((f) => f.properties.coverage), expected.coverage)
  assert.deepEqual(result.features.map((f) => f.properties.risk), expected.risk)
})

test('i18n falls back to English and interpolates', () => {
  assert.match(translate('ne', 'alertWatch', { place: 'Syabrubesi' }), /Syabrubesi/)
  assert.equal(translate('xx', 'map'), 'Map')
  for (const lang of Object.keys(STRINGS)) assert.deepEqual(Object.keys(STRINGS[lang]).sort(), Object.keys(STRINGS.en).sort())
})
