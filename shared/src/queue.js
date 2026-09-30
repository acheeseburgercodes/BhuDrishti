/**
 * Durable offline queue with exponential backoff, used by the mobile app (AsyncStorage)
 * and the web portal (localStorage). Storage is injected so the logic is testable.
 *
 * storage: { getItem(key): Promise<string|null>|string|null, setItem(key, value) }
 * send(item.payload): resolves on success; rejects with an error. Errors with
 *   `permanent: true` (e.g. HTTP 4xx validation failures) are dropped to `failed`
 *   instead of retried forever.
 */

export const QUEUE_DEFAULTS = Object.freeze({
  key: 'bhudrishti.outbox.v1',
  maxItems: 500,
  maxAttempts: 8,
  baseDelayMs: 2000,
  maxDelayMs: 5 * 60 * 1000,
})

/** Exponential backoff with full jitter, capped. `random` injectable for tests. */
export function computeBackoff(attempt, { baseDelayMs = QUEUE_DEFAULTS.baseDelayMs, maxDelayMs = QUEUE_DEFAULTS.maxDelayMs } = {}, random = Math.random) {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1))
  return Math.round(ceiling / 2 + random() * (ceiling / 2))
}

/** Classify an HTTP status as permanent (don't retry) or transient. */
export function isPermanentStatus(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export class OfflineQueue {
  constructor(storage, options = {}) {
    this.storage = storage
    this.options = { ...QUEUE_DEFAULTS, ...options }
    this.now = options.now || (() => Date.now())
    this.random = options.random || Math.random
    this.items = []
    this.failed = []
    this.loaded = false
    this.flushing = false
    this.listeners = new Set()
  }

  async load() {
    if (this.loaded) return this
    try {
      const raw = await this.storage.getItem(this.options.key)
      const parsed = raw ? JSON.parse(raw) : {}
      this.items = Array.isArray(parsed.items) ? parsed.items : []
      this.failed = Array.isArray(parsed.failed) ? parsed.failed : []
    } catch {
      this.items = []
      this.failed = []
    }
    this.loaded = true
    this.emit()
    return this
  }

  async persist() {
    await this.storage.setItem(this.options.key, JSON.stringify({ items: this.items, failed: this.failed.slice(-50) }))
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.status())
    return () => this.listeners.delete(listener)
  }

  emit() {
    const status = this.status()
    this.listeners.forEach((listener) => listener(status))
  }

  status() {
    const nextAttemptAt = this.items.reduce((min, item) => Math.min(min, item.nextAttemptAt), Infinity)
    return {
      pending: this.items.length,
      failed: this.failed.length,
      flushing: this.flushing,
      nextAttemptAt: Number.isFinite(nextAttemptAt) ? nextAttemptAt : null,
      lastError: this.items.find((item) => item.lastError)?.lastError || null,
    }
  }

  async enqueue(payload, id = payload?.client_event_id) {
    await this.load()
    if (!id) throw new Error('queued payload needs a client_event_id for idempotent retry')
    if (this.items.some((item) => item.id === id)) return this.items.find((item) => item.id === id)
    const item = { id, payload: { ...payload, queued: true, queued_at: payload.queued_at || new Date(this.now()).toISOString() }, attempts: 0, createdAt: this.now(), nextAttemptAt: this.now(), lastError: null }
    this.items.push(item)
    // Drop the oldest items beyond capacity rather than refusing new (fresher) readings.
    while (this.items.length > this.options.maxItems) this.failed.push({ ...this.items.shift(), lastError: 'dropped: queue full' })
    await this.persist()
    this.emit()
    return item
  }

  /** Attempt all due items in FIFO order. Returns counts. */
  async flush(send, { force = false } = {}) {
    await this.load()
    if (this.flushing) return { sent: 0, retried: 0, dropped: 0, skipped: true }
    this.flushing = true
    this.emit()
    const result = { sent: 0, retried: 0, dropped: 0, skipped: false }
    try {
      for (const item of [...this.items]) {
        if (!force && item.nextAttemptAt > this.now()) continue
        try {
          await send({ ...item.payload, attempt: item.attempts + 1 })
          this.items = this.items.filter((candidate) => candidate.id !== item.id)
          result.sent += 1
        } catch (error) {
          item.attempts += 1
          item.lastError = String(error?.message || error).slice(0, 200)
          if (error?.permanent || item.attempts >= this.options.maxAttempts) {
            this.items = this.items.filter((candidate) => candidate.id !== item.id)
            this.failed.push(item)
            result.dropped += 1
          } else {
            item.nextAttemptAt = this.now() + computeBackoff(item.attempts, this.options, this.random)
            result.retried += 1
            // Stop on transient network failure: later items will fail the same way.
            if (!error?.status) break
          }
        }
      }
    } finally {
      this.flushing = false
      await this.persist()
      this.emit()
    }
    return result
  }

  async clearFailed() {
    this.failed = []
    await this.persist()
    this.emit()
  }
}

/** In-memory storage adapter (tests, SSR). */
export function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value },
    dump: () => ({ ...data }),
  }
}
