/**
 * Indicative sensing-coverage model (JS port of backend/coverage.py — keep in sync; the
 * parity test in shared/test and backend/tests checks both against the same fixture).
 *
 * coverage(cell) = 1 - Π(1 - range_i · freshness_i · reliability_i)
 *   range_i       = max(0, 1 - (d / R)^2), R = node sensing range (assumed, per source)
 *   freshness_i   = 1 until `full_minutes`, linear to 0 at `max_minutes` since last_seen
 *   reliability_i = reported reliability (default 0.8 = unknown), × battery and status penalties
 * risk(cell) = base + river proximity + settlement exposure (no DEM/slope input yet).
 * It is a planning aid for where sensing is thin, not a hazard or detection-probability map.
 */

const KM_PER_DEG_LAT = 110.57
const KM_PER_DEG_LNG_EQ = 111.32

const round = (value, digits = 3) => {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function distanceKm(a, b) {
  const meanLat = ((a[0] + b[0]) / 2) * (Math.PI / 180)
  const dy = (b[0] - a[0]) * KM_PER_DEG_LAT
  const dx = (b[1] - a[1]) * KM_PER_DEG_LNG_EQ * Math.cos(meanLat)
  return Math.hypot(dx, dy)
}

export function pointToSegmentKm(p, a, b) {
  const cosLat = Math.cos(p[0] * (Math.PI / 180))
  const toXY = (q) => [(q[1] - p[1]) * KM_PER_DEG_LNG_EQ * cosLat, (q[0] - p[0]) * KM_PER_DEG_LAT]
  const [ax, ay] = toXY(a)
  const [bx, by] = toXY(b)
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

export function freshnessFactor(ageMinutes, { full_minutes: full, max_minutes: max }) {
  if (ageMinutes == null || !Number.isFinite(ageMinutes)) return 0
  if (ageMinutes <= full) return 1
  if (ageMinutes >= max) return 0
  return 1 - (ageMinutes - full) / (max - full)
}

export function rangeFactor(distance, rangeKm) {
  if (!(rangeKm > 0) || distance >= rangeKm) return 0
  return 1 - (distance / rangeKm) ** 2
}

export function reliabilityFactor(node, model) {
  if (node.status === 'offline') return 0
  let value = typeof node.reliability === 'number' ? node.reliability : model.default_reliability
  const battery = node.battery_pct
  if (typeof battery === 'number') {
    if (battery < 15) value *= 0.5
    else if (battery < 30) value *= 0.8
  }
  if (node.status === 'warning') value *= 0.75
  return Math.max(0, Math.min(1, value))
}

export function nodeContributionInputs(node, model, asOfMs) {
  const lastSeen = node.last_seen ? Date.parse(node.last_seen) : NaN
  const ageMinutes = Number.isNaN(lastSeen) ? null : Math.max(0, (asOfMs - lastSeen) / 60000)
  const source = node.source || 'esp32_node'
  return {
    id: node.id,
    lat: node.lat,
    lng: node.lng,
    range_km: typeof node.range_km === 'number' ? node.range_km : model.default_range_km[source] ?? model.default_range_km.esp32_node,
    freshness: freshnessFactor(ageMinutes, model.freshness),
    reliability: reliabilityFactor(node, model),
    age_minutes: ageMinutes == null ? null : round(ageMinutes, 1),
  }
}

export function riskAt(point, model, settlements = []) {
  const r = model.risk
  let river = Infinity
  for (const line of model.rivers) {
    for (let i = 0; i < line.length - 1; i += 1) river = Math.min(river, pointToSegmentKm(point, line[i], line[i + 1]))
  }
  const riverFactor = Number.isFinite(river) ? Math.exp(-river / r.river_scale_km) : 0
  let exposure = 0
  for (const s of settlements) {
    const d = distanceKm(point, [s.lat, s.lng])
    exposure = Math.max(exposure, Math.exp(-d / r.settlement_scale_km) * Math.min(1, (s.population || 0) / r.population_ref))
  }
  return Math.max(0, Math.min(1, r.base + r.river_weight * riverFactor + r.settlement_weight * exposure))
}

export function band(coverage, model) {
  if (coverage >= model.bands.covered) return 'covered'
  if (coverage >= model.bands.partial) return 'partial'
  return 'uncovered'
}

/** Build the grid as a GeoJSON FeatureCollection plus a summary. */
export function computeCoverage({ nodes = [], settlements = [], model, asOf = Date.now(), maxAgeMinutes } = {}) {
  const effective = maxAgeMinutes ? { ...model, freshness: { ...model.freshness, max_minutes: maxAgeMinutes, full_minutes: Math.min(model.freshness.full_minutes, maxAgeMinutes) } } : model
  const asOfMs = typeof asOf === 'number' ? asOf : Date.parse(asOf)
  const inputs = nodes
    .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng))
    .map((n) => nodeContributionInputs(n, effective, asOfMs))
  const { bbox, cell_deg: step } = effective
  const rows = Math.round((bbox.max_lat - bbox.min_lat) / step)
  const cols = Math.round((bbox.max_lng - bbox.min_lng) / step)
  const features = []
  const counts = { covered: 0, partial: 0, uncovered: 0 }
  let riskSum = 0
  let weightedCoverage = 0
  let highRisk = 0
  let highRiskUncovered = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lat0 = bbox.min_lat + row * step
      const lng0 = bbox.min_lng + col * step
      const center = [lat0 + step / 2, lng0 + step / 2]
      let miss = 1
      let contributors = 0
      for (const node of inputs) {
        const c = rangeFactor(distanceKm(center, [node.lat, node.lng]), node.range_km) * node.freshness * node.reliability
        if (c > 0) { miss *= 1 - c; contributors += 1 }
      }
      const coverage = round(1 - miss)
      const risk = round(riskAt(center, effective, settlements))
      const b = band(coverage, effective)
      counts[b] += 1
      riskSum += risk
      weightedCoverage += risk * coverage
      if (risk >= effective.risk.high_threshold) {
        highRisk += 1
        if (b === 'uncovered') highRiskUncovered += 1
      }
      features.push({
        type: 'Feature',
        id: row * cols + col,
        geometry: { type: 'Polygon', coordinates: [[[lng0, lat0], [lng0 + step, lat0], [lng0 + step, lat0 + step], [lng0, lat0 + step], [lng0, lat0]]] },
        properties: { coverage, risk, gap: round(risk * (1 - coverage)), band: b, contributors },
      })
    }
  }
  return {
    type: 'FeatureCollection',
    features,
    summary: {
      cells: features.length,
      ...counts,
      risk_weighted_coverage: riskSum ? round(weightedCoverage / riskSum) : 0,
      high_risk_cells: highRisk,
      high_risk_uncovered: highRiskUncovered,
      as_of: new Date(asOfMs).toISOString(),
      max_age_minutes: effective.freshness.max_minutes,
      nodes_contributing: inputs.filter((n) => n.freshness * n.reliability > 0).length,
    },
    nodes: inputs,
  }
}
