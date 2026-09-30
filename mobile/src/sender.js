/**
 * Network sender used by the offline queue. Kept free of React Native imports so it can
 * be unit-tested with `node --test` (see mobile/test/sender.test.mjs).
 */
export class SendError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
    // 4xx (except 408/429) means the server rejected the payload: retrying will not help.
    this.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429
  }
}

export function normaliseBaseUrl(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) throw new SendError('Backend URL must start with http:// or https://')
  return trimmed
}

// AbortSignal.timeout is not available on Hermes; use AbortController.
export async function fetchWithTimeout(fetchImpl, url, options = {}, ms = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } catch (error) {
    throw new SendError(error?.name === 'AbortError' ? 'Request timed out' : 'Network unavailable')
  } finally {
    clearTimeout(timer)
  }
}

export function makeSender({ baseUrl, fetchImpl = fetch, deviceKey } = {}) {
  return async function send(payload) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (deviceKey) headers['X-Device-Key'] = deviceKey
    const response = await fetchWithTimeout(fetchImpl, `${normaliseBaseUrl(baseUrl)}/api/ingest`, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!response.ok) {
      let detail = ''
      try { const body = await response.json(); detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail || '') } catch { /* ignore */ }
      throw new SendError(`HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`, response.status)
    }
    return response.json()
  }
}

export async function getJson(baseUrl, path, fetchImpl = fetch, ms = 8000) {
  const response = await fetchWithTimeout(fetchImpl, `${normaliseBaseUrl(baseUrl)}${path}`, { headers: { Accept: 'application/json' } }, ms)
  if (!response.ok) throw new SendError(`HTTP ${response.status}`, response.status)
  return response.json()
}
