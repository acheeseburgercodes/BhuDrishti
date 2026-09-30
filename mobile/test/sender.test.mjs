import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeSender, normaliseBaseUrl, SendError } from '../src/sender.js'
import { OfflineQueue, memoryStorage } from '../../shared/src/queue.js'

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body })
const status = (code, detail = 'bad') => async () => ({ ok: false, status: code, json: async () => ({ detail }) })
const down = async () => { throw new TypeError('Network request failed') }

test('base URL validation', () => {
  assert.equal(normaliseBaseUrl(' http://10.0.0.2:8000/ '), 'http://10.0.0.2:8000')
  assert.throws(() => normaliseBaseUrl('10.0.0.2:8000'), SendError)
})

test('HTTP status classification drives retry vs drop', async () => {
  await assert.rejects(makeSender({ baseUrl: 'http://x', fetchImpl: status(422) })({}), (e) => e.permanent && e.status === 422)
  await assert.rejects(makeSender({ baseUrl: 'http://x', fetchImpl: status(429) })({}), (e) => !e.permanent)
  await assert.rejects(makeSender({ baseUrl: 'http://x', fetchImpl: status(503) })({}), (e) => !e.permanent)
  await assert.rejects(makeSender({ baseUrl: 'http://x', fetchImpl: down })({}), (e) => !e.permanent && e.status === 0)
})

test('queue + sender: offline capture is retained, then synced once online', async () => {
  let now = 0
  const queue = new OfflineQueue(memoryStorage(), { now: () => now, random: () => 0 })
  await queue.enqueue({ node_id: 'BD-001', client_event_id: 'm-1', sensor_window: [0, 0, 0, 0, 0, 0, 0, 0] })
  await queue.flush(makeSender({ baseUrl: 'http://x', fetchImpl: down }))
  assert.equal(queue.status().pending, 1)
  now = 10_000
  const result = await queue.flush(makeSender({ baseUrl: 'http://x', fetchImpl: ok({ id: 'evt-1' }) }))
  assert.equal(result.sent, 1)
  assert.equal(queue.status().pending, 0)
})

test('device key header is attached when configured', async () => {
  let seen
  const fetchImpl = async (url, options) => { seen = options.headers; return { ok: true, status: 200, json: async () => ({}) } }
  await makeSender({ baseUrl: 'http://x', fetchImpl, deviceKey: 'k' })({})
  assert.equal(seen['X-Device-Key'], 'k')
})
