/**
 * Compact coverage/gap preview for the homepage. Uses the real shared coverage model
 * (shared/src/coverage.js) on the bundled demo seed, drawn as a lightweight SVG so the
 * homepage does not load MapLibre. Scenarios are simulated and labelled as such.
 */
import { useMemo, useState } from 'react'
import { computeCoverage } from '@shared/coverage.js'
import coverageModel from '@shared-fixtures/coverage-model.json'
import seed from '../../../nepal-flood-corridor-seed-data.json'
import { SegmentedControl, cx } from '../components/ui.jsx'
import { portalHref } from '../lib/route.js'

const AS_OF = Date.parse('2026-01-01T06:00:00Z')
const W = 480
const { bbox } = coverageModel
const H = Math.round(W * (bbox.max_lat - bbox.min_lat) / (bbox.max_lng - bbox.min_lng))
const px = (lng) => ((lng - bbox.min_lng) / (bbox.max_lng - bbox.min_lng)) * W
const py = (lat) => ((bbox.max_lat - lat) / (bbox.max_lat - bbox.min_lat)) * H

// Illustrative phone positions near settlements (simulated volunteers, not real devices).
const SIM_PHONES = [
  [28.158, 85.35], [28.114, 85.30], [27.905, 85.152], [27.966, 85.19], [28.04, 85.24], [28.2, 85.36], [28.09, 85.28], [27.868, 85.13],
].map(([lat, lng], i) => ({ id: `SIM-P${i + 1}`, name: `Simulated phone ${i + 1}`, lat, lng, source: 'phone_layer', status: 'online', reliability: 0.6, last_seen: new Date(AS_OF - 60e3).toISOString() }))

const baseNodes = seed.nodes.map(({ demo_last_seen_offset_s: offset, ...n }) => ({ ...n, last_seen: offset != null ? new Date(AS_OF - offset * 1000).toISOString() : null }))

export const SCENARIOS = [
  { value: 'esp32', label: 'ESP32 only', nodes: () => baseNodes, note: 'Seven demo field nodes at their seeded freshness. BD-005 has been silent for 2 h and BD-003 reports a warning status, so their stretches thin out.' },
  { value: 'phones', label: '+ Phone layer', nodes: () => [...baseNodes, ...SIM_PHONES], note: 'Eight simulated phones near settlements add short-range (≈1 km assumed) readings that help fill gaps between field nodes.' },
  { value: 'silent', label: 'Nodes silent', nodes: () => baseNodes.map((n) => (['BD-002', 'BD-006'].includes(n.id) ? { ...n, status: 'offline' } : n)), note: 'If BD-002 and BD-006 also go quiet, the gap map shows exactly where sensing evidence disappears. Silence is never treated as safety.' },
]

const FILL = { covered: 'var(--bd-accent)', partial: 'var(--bd-marigold)' }

export function NetworkPreview() {
  const [scenario, setScenario] = useState('esp32')
  const active = SCENARIOS.find((s) => s.value === scenario)
  const result = useMemo(() => computeCoverage({ nodes: active.nodes(), settlements: seed.settlements, model: coverageModel, asOf: AS_OF }), [active])
  const { summary } = result
  const rivers = coverageModel.rivers.map((line) => line.map(([lat, lng]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' '))
  const pct = (n) => `${Math.round((n / summary.cells) * 100)}%`

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <figure className="relative m-0 overflow-hidden rounded-3xl border border-line bg-sunken p-3">
        <span className="absolute top-5 left-5 z-10 rounded-full border border-demo/30 bg-raised/90 px-2.5 py-0.5 text-xs font-medium text-demo">Simulated · demo seed</span>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
          aria-label={`Coverage preview, ${active.label}: ${summary.covered} cells covered, ${summary.partial} partial, ${summary.uncovered} uncovered, ${summary.high_risk_uncovered} high-risk cells without coverage.`}>
          <rect width={W} height={H} fill="var(--bd-sunken)" />
          {result.features.map((f) => {
            const [[lng0, lat0], , [lng1, lat1]] = f.geometry.coordinates[0]
            const { band, risk, coverage } = f.properties
            const fill = FILL[band] || 'var(--bd-danger)'
            const opacity = band === 'uncovered' ? Math.max(0, risk - 0.25) * 0.55 : 0.18 + coverage * 0.5
            return <rect key={f.id} x={px(lng0)} y={py(lat1)} width={px(lng1) - px(lng0) + 0.3} height={py(lat0) - py(lat1) + 0.3} fill={fill} fillOpacity={opacity.toFixed(3)} />
          })}
          {rivers.map((points, i) => <polyline key={i} points={points} fill="none" stroke="var(--bd-river)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />)}
          {seed.settlements.map((s) => (
            <g key={s.id}>
              <rect x={px(s.lng) - 3} y={py(s.lat) - 3} width="6" height="6" transform={`rotate(45 ${px(s.lng)} ${py(s.lat)})`} fill="var(--bd-ink)" />
              <text x={px(s.lng) + 8} y={py(s.lat) + 4} fontSize="11" fill="var(--bd-ink)" className="font-sans" paintOrder="stroke" stroke="var(--bd-sunken)" strokeWidth="3">{s.name}</text>
            </g>
          ))}
          {result.nodes.map((n) => {
            const on = n.freshness * n.reliability > 0
            const phone = n.source === 'phone_layer'
            return (
              <g key={n.id}>
                {on && !phone && <circle className="ping" style={{ '--ping-delay': `${(n.lat * 97) % 2}s` }} cx={px(n.lng)} cy={py(n.lat)} r="5" fill="none" stroke="var(--bd-accent)" strokeWidth="1.5" />}
                <circle cx={px(n.lng)} cy={py(n.lat)} r={phone ? 3 : 5} fill={on ? (phone ? 'var(--bd-river)' : 'var(--bd-accent)') : 'var(--bd-raised)'} stroke={on ? 'var(--bd-raised)' : 'var(--bd-danger)'} strokeWidth="1.5" />
              </g>
            )
          })}
        </svg>
        <figcaption className="px-2 pt-2 text-xs text-muted">
          Indicative model: assumed sensing ranges × freshness × reliability, weighted by a river/settlement risk proxy. Not a statement that any area is safe.
        </figcaption>
      </figure>

      <div className="flex flex-col gap-4">
        <SegmentedControl label="Coverage scenario" options={SCENARIOS} value={scenario} onChange={setScenario} size="sm" />
        <p className="text-sm leading-relaxed text-muted" aria-live="polite">{active.note}</p>
        <dl className="grid grid-cols-3 gap-2">
          {[['Covered', summary.covered, 'text-accent'], ['Partial', summary.partial, 'text-marigold'], ['Gaps', summary.uncovered, 'text-danger']].map(([k, v, tone]) => (
            <div key={k} className="rounded-2xl border border-line bg-raised p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className={cx('m-0 text-xl font-semibold tabular-nums', tone)}>{pct(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-ink"><span className="font-semibold tabular-nums">{summary.high_risk_uncovered}</span> of {summary.high_risk_cells} higher-risk cells (near river or settlements) have no fresh sensing evidence.</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />ESP32 node</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-river" />Phone (simulated)</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full border-2 border-danger" />Silent node</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rotate-45 bg-ink" />Settlement</li>
        </ul>
        <a href={portalHref('map')} className="mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-line bg-raised px-4 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-accent">
          Open the live coverage map <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  )
}
