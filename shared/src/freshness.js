/** Freshness/health states for nodes and devices, shared by web and mobile. */
export const FRESHNESS_THRESHOLDS_MIN = Object.freeze({ live: 2, recent: 15, stale: 60 })

export function freshnessState(lastSeen, now = Date.now()) {
  const t = lastSeen ? Date.parse(lastSeen) : NaN
  if (Number.isNaN(t)) return 'never'
  const minutes = (now - t) / 60000
  if (minutes <= FRESHNESS_THRESHOLDS_MIN.live) return 'live'
  if (minutes <= FRESHNESS_THRESHOLDS_MIN.recent) return 'recent'
  if (minutes <= FRESHNESS_THRESHOLDS_MIN.stale) return 'stale'
  return 'offline'
}

export function formatAge(lastSeen, now = Date.now()) {
  const t = lastSeen ? Date.parse(lastSeen) : NaN
  if (Number.isNaN(t)) return 'never seen'
  const seconds = Math.max(0, Math.round((now - t) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
