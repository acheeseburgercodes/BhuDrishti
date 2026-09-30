/** Thin API client. Only public endpoints; operator token is held in sessionStorage. */
export const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
export const WS_URL = `${API.replace(/^http/, 'ws')}/ws/live`
const TOKEN_KEY = 'bhudrishti.operatorToken'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
    this.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429
  }
}

export const operatorToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY) || '',
  set: (value) => (value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY)),
}

export async function apiFetch(path, { method = 'GET', body, timeoutMs = 8000, operator = false } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (operator && operatorToken.get()) headers['X-Operator-Token'] = operatorToken.get()
  try {
    const response = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal })
    if (!response.ok) {
      let detail = ''
      try { detail = (await response.json()).detail } catch { /* non-JSON body */ }
      throw new ApiError(typeof detail === 'string' && detail ? detail : `HTTP ${response.status}`, response.status)
    }
    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('Request timed out', 0)
    if (error instanceof ApiError) throw error
    throw new ApiError('Network unavailable', 0)
  } finally {
    clearTimeout(timer)
  }
}
