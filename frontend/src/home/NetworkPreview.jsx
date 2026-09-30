/**
 * Coverage-gap preview for the landing page. Runs the real shared coverage model
 * (shared/src/coverage.js, parity-tested with backend/coverage.py) on the bundled demo seed
 * and draws it as a static SVG, so the landing page never loads MapLibre. Scenarios are
 * simulated and labelled as such; the live map is the portal's #map route.
 */
import { useMemo, useState } from 'react'
import { computeCoverage } from '@shared/coverage.js'
import coverageModel from '@shared-fixtures/coverage-model.json'
import seed from '../../../nepal-flood-corridor-seed-data.json'
import { cx } from '../components/ui.jsx'
import { portalHref } from '../lib/route.js'
import { Arrow, ButtonLink, Choice } from './landing-ui.jsx'

const AS_OF = Date.parse('2026-01-01T06:00:00Z')
const W = 420
const { bbox } = coverageModel
const H = Math.round(W * (bbox.max_lat - bbox.min_lat) / (bbox.max_lng - bbox.min_lng))
const px = (lng) => ((lng - bbox.min_lng) / (bbox.max_lng - bbox.min_lng)) * W
const py = (lat) => ((bbox.max_lat - lat) / (bbox.max_lat - bbox.min_lat)) * H

// Illustrative phone positions near settlements (simulated volunteers, not real devices).
const SIM_PHONES = [
  [28.158, 85.35], [28.114, 85.30], [27.905, 85.152], [27.966, 85.19], [28.04, 85.24], [28.2, 85.36], [28.09, 85.28], [27.868, 85.13],
].map(([lat, lng], i) => ({ id: `SIM-P${i + 1}`, name: `Simulated phone ${i + 1}`, lat, lng, source: 'phone_layer', status: 'online', reliability: 0.6, last_seen: new Date(AS_OF - 60e3).toISOString() }))

const baseNodes = seed.nodes.map(({ demo_last_seen_offset_s: offset, ...n }) => ({ ...n, last_seen: offset != null ? new Date(AS_OF - offset * 1000).toISOString() : null }))

export const SCENARIOS = {
  esp32: () => baseNodes,
  phones: () => [...baseNodes, ...SIM_PHONES],
  silent: () => baseNodes.map((n) => (['BD-002', 'BD-006'].includes(n.id) ? { ...n, status: 'offline' } : n)),
}

const FILL = { covered: 'var(--bd-accent)', partial: 'var(--bd-marigold)', uncovered: 'var(--bd-danger)' }

export function NetworkPreview({ c }) {
  const [scenario, setScenario] = useState('esp32')
  const result = useMemo(() => computeCoverage({ nodes: SCENARIOS[scenario](), settlements: seed.settlements, model: coverageModel, asOf: AS_OF }), [scenario])
  const { summary } = result
  const [label, note] = c(`coverage.scenarios.${scenario}`)
  const rivers = coverageModel.rivers.map((line) => line.map(([lat, lng]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' '))
  const pct = (n) => `${Math.round((n / summary.cells) * 100)}%`
  const options = Object.keys(SCENARIOS).map((value) => ({ value, label: c(`coverage.scenarios.${value}`)[0] }))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
      <figure className="m-0 overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="text-xs font-semibold text-demo">{c('coverage.simulated')}</span>
          <span className="text-xs text-muted">{label}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full bg-sunken" role="img"
          aria-label={c('coverage.mapLabel', { scenario: label, covered: summary.covered, partial: summary.partial, uncovered: summary.uncovered, highRisk: summary.high_risk_uncovered })}>
          {result.features.map((f) => {
            const [[lng0, lat0], , [lng1, lat1]] = f.geometry.coordinates[0]
            const { band, risk, coverage } = f.properties
            const opacity = band === 'uncovered' ? Math.max(0, risk - 0.25) * 0.5 : 0.16 + coverage * 0.45
            return <rect key={f.id} x={px(lng0)} y={py(lat1)} width={px(lng1) - px(lng0) + 0.3} height={py(lat0) - py(lat1) + 0.3} fill={FILL[band]} fillOpacity={opacity.toFixed(3)} />
          })}
          {rivers.map((points, i) => <polyline key={i} points={points} fill="none" stroke="var(--bd-river)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />)}
          {seed.settlements.map((s) => {
            const x = px(s.lng)
            const y = py(s.lat)
            const right = x < W * 0.62
            return (
              <g key={s.id}>
                <rect x={x - 3.5} y={y - 3.5} width="7" height="7" transform={`rotate(45 ${x} ${y})`} fill="var(--bd-ink)" />
                <text x={right ? x + 9 : x - 9} y={y + 4.5} textAnchor={right ? 'start' : 'end'} fontSize="13" fontWeight="500" fill="var(--bd-ink)" paintOrder="stroke" stroke="var(--bd-sunken)" strokeWidth="3.5" strokeLinejoin="round">{s.name.replace(/ \(.*\)/, '')}</text>
              </g>
            )
          })}
          {result.nodes.map((n) => {
            const on = n.freshness * n.reliability > 0
            const phone = String(n.id).startsWith('SIM-P')
            return <circle key={n.id} cx={px(n.lng)} cy={py(n.lat)} r={phone ? 3.5 : 5.5} fill={on ? (phone ? 'var(--bd-river)' : 'var(--bd-accent)') : 'var(--bd-raised)'} stroke={on ? 'var(--bd-raised)' : 'var(--bd-danger)'} strokeWidth="2" />
          })}
        </svg>
        <figcaption className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">{c('coverage.caption')}</figcaption>
      </figure>

      <div className="flex flex-col gap-5">
        <Choice label={c('coverage.scenarioLabel')} options={options} value={scenario} onChange={setScenario} />
        <p className="min-h-18 text-sm leading-relaxed text-muted" aria-live="polite">{note}</p>
        <dl className="grid grid-cols-3 gap-2">
          {[['covered', summary.covered, 'text-accent'], ['partial', summary.partial, 'text-marigold'], ['gaps', summary.uncovered, 'text-danger']].map(([k, v, tone]) => (
            <div key={k} className="rounded-xl border border-line bg-raised p-3">
              <dt className="text-xs text-muted">{c(`coverage.${k}`)}</dt>
              <dd className={cx('m-0 mt-0.5 font-semibold text-2xl tabular-nums lining-nums', tone)}>{pct(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm leading-relaxed text-ink">{c('coverage.highRisk', { n: summary.high_risk_uncovered, total: summary.high_risk_cells })}</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full bg-accent" />{c('coverage.legendNode')}</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-river" />{c('coverage.legendPhone')}</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full border-2 border-danger bg-raised" />{c('coverage.legendSilent')}</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rotate-45 bg-ink" />{c('coverage.legendSettlement')}</li>
        </ul>
        <ButtonLink href={portalHref('map')} variant="secondary" className="mt-auto w-full sm:w-fit">{c('coverage.open')} <Arrow /></ButtonLink>
      </div>
    </div>
  )
}
