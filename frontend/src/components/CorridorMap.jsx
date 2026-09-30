import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { computeCoverage } from '@shared/coverage.js'
import { freshnessState, formatAge } from '@shared/freshness.js'
import coverageModel from '@shared-fixtures/coverage-model.json'
import { useI18n } from '../lib/i18n.jsx'
import { Badge, Button, Card, SegmentedControl } from './ui.jsx'

const CENTER = [85.3, 28.07]
const BASEMAPS = {
  openfreemap: { label: 'OpenFreeMap', style: 'https://tiles.openfreemap.org/styles/positron' },
  osm: {
    label: 'OSM raster',
    style: {
      version: 8,
      sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
  },
  none: { label: 'No basemap (offline)', style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8ece9' } }] } },
}
const FRESH_COLOR = { live: '#15803d', recent: '#0f766e', stale: '#b45309', offline: '#b91c1c', never: '#6b7280' }
export const BAND_COLOR = { covered: '#15803d', partial: '#ca8a04', uncovered: '#b91c1c' }

const riversGeoJSON = {
  type: 'FeatureCollection',
  features: coverageModel.rivers.map((line, i) => ({ type: 'Feature', id: i, properties: {}, geometry: { type: 'LineString', coordinates: line.map(([lat, lng]) => [lng, lat]) } })),
}

function nodesGeoJSON(nodes, now) {
  return {
    type: 'FeatureCollection',
    features: nodes.filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng)).map((n) => ({
      type: 'Feature', properties: { id: n.id, name: n.name, freshness: freshnessState(n.last_seen, now), status: n.status || 'unknown', phone: n.source === 'phone_layer' || n.kind === 'phone' },
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
    })),
  }
}

function eventsGeoJSON(events, windowMin, now) {
  return {
    type: 'FeatureCollection',
    features: events.filter((e) => e.classification?.classification === 'event' && Number.isFinite(e.lat) && now - Date.parse(e.recorded_at) <= windowMin * 60000)
      .map((e) => ({ type: 'Feature', properties: { id: e.id, conf: e.alert_confidence || 0, confirmed: !!e.cross_confirmation?.cross_confirmed, phone: e.source === 'phone_layer' }, geometry: { type: 'Point', coordinates: [e.lng, e.lat] } })),
  }
}

function addLayers(map) {
  const src = (id, data) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data }) }
  src('coverage', { type: 'FeatureCollection', features: [] })
  src('rivers', riversGeoJSON)
  src('nodes', { type: 'FeatureCollection', features: [] })
  src('events', { type: 'FeatureCollection', features: [] })
  if (map.getLayer('coverage-fill')) return
  map.addLayer({ id: 'coverage-fill', type: 'fill', source: 'coverage', paint: { 'fill-color': '#b91c1c', 'fill-opacity': 0.3 } })
  map.addLayer({ id: 'coverage-outline', type: 'line', source: 'coverage', paint: { 'line-color': '#ffffff', 'line-opacity': 0.12, 'line-width': 0.5 } })
  map.addLayer({ id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': '#1d4ed8', 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [2, 1] } })
  map.addLayer({ id: 'events-halo', type: 'circle', source: 'events', paint: { 'circle-radius': ['+', 10, ['*', 14, ['get', 'conf']]], 'circle-color': ['case', ['get', 'confirmed'], '#c2410c', '#b45309'], 'circle-opacity': 0.2, 'circle-stroke-width': 1, 'circle-stroke-color': '#c2410c' } })
  map.addLayer({ id: 'nodes', type: 'circle', source: 'nodes', paint: {
    'circle-radius': ['case', ['get', 'phone'], 5, 7],
    'circle-color': ['match', ['get', 'freshness'], 'live', FRESH_COLOR.live, 'recent', FRESH_COLOR.recent, 'stale', FRESH_COLOR.stale, 'offline', FRESH_COLOR.offline, FRESH_COLOR.never],
    'circle-stroke-width': ['case', ['==', ['get', 'status'], 'critical'], 3, 2], 'circle-stroke-color': ['case', ['==', ['get', 'status'], 'critical'], '#c2410c', '#ffffff'],
  } })
}

function paintCoverage(map, view) {
  if (!map.getLayer('coverage-fill')) return
  map.setLayoutProperty('coverage-fill', 'visibility', view === 'off' ? 'none' : 'visible')
  map.setLayoutProperty('coverage-outline', 'visibility', view === 'off' ? 'none' : 'visible')
  if (view === 'coverage') {
    map.setPaintProperty('coverage-fill', 'fill-color', ['match', ['get', 'band'], 'covered', BAND_COLOR.covered, 'partial', BAND_COLOR.partial, BAND_COLOR.uncovered])
    // Uncovered cells fade with risk so low-risk hillsides do not dominate the view.
    map.setPaintProperty('coverage-fill', 'fill-opacity', ['case', ['==', ['get', 'band'], 'uncovered'], ['+', 0.04, ['*', 0.42, ['get', 'risk']]], 0.42])
  } else if (view === 'gap') {
    map.setPaintProperty('coverage-fill', 'fill-color', ['interpolate', ['linear'], ['get', 'gap'], 0, '#f5f5f4', 0.3, '#fbbf24', 0.6, '#b91c1c'])
    map.setPaintProperty('coverage-fill', 'fill-opacity', ['interpolate', ['linear'], ['get', 'gap'], 0, 0.02, 0.6, 0.55])
  }
}

export function CoverageLegend({ view }) {
  const { t } = useI18n()
  return (
    <div className="text-xs text-ink" aria-label="Map legend">
      {view === 'gap' ? (
        <div><p className="mb-1 font-medium">Gap priority = risk × (1 − coverage)</p><div className="h-2 w-40 rounded bg-gradient-to-r from-stone-100 via-amber-400 to-red-700" aria-hidden="true" /><div className="flex w-40 justify-between text-muted"><span>low</span><span>high</span></div></div>
      ) : view === 'coverage' && (
        <ul className="flex flex-wrap gap-3">
          {['covered', 'partial', 'uncovered'].map((b) => <li key={b} className="flex items-center gap-1"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: BAND_COLOR[b], opacity: b === 'uncovered' ? 0.6 : 0.8 }} />{t(b)}</li>)}
          <li className="text-muted">uncovered cells shaded by risk</li>
        </ul>
      )}
      <ul className="mt-2 flex flex-wrap gap-3">
        {Object.entries(FRESH_COLOR).map(([k, c]) => <li key={k} className="flex items-center gap-1"><span aria-hidden="true" className="size-3 rounded-full border-2 border-white" style={{ background: c }} />{k === 'offline' ? 'silent >60 min' : k}</li>)}
        <li className="flex items-center gap-1"><span aria-hidden="true" className="size-3 rounded-full border border-watch bg-watch/20" />event (window)</li>
        <li className="flex items-center gap-1"><span aria-hidden="true" className="h-0.5 w-4 border-t-2 border-dashed border-blue-700" />river (approx.)</li>
      </ul>
    </div>
  )
}

export function CorridorMap({ nodes, events, settlements, now, selectedNodeId, onSelectNode, compact = false }) {
  const { t } = useI18n()
  const container = useRef(null)
  const mapRef = useRef(null)
  const [basemap, setBasemap] = useState(() => (navigator.onLine === false ? 'none' : 'openfreemap'))
  const [view, setView] = useState('coverage')
  const [maxAge, setMaxAge] = useState(60)
  const [eventWindow, setEventWindow] = useState(60)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [cell, setCell] = useState(null)
  const [mapFailed, setMapFailed] = useState(false)

  const coverage = useMemo(() => computeCoverage({ nodes, settlements, model: coverageModel, asOf: now, maxAgeMinutes: maxAge }), [nodes, settlements, now, maxAge])
  const topGaps = useMemo(() => [...coverage.features].sort((a, b) => b.properties.gap - a.properties.gap).slice(0, 5), [coverage])

  useEffect(() => {
    if (!container.current) return undefined
    let map
    try {
      map = new maplibregl.Map({
        container: container.current, style: BASEMAPS[basemap].style, center: CENTER, zoom: compact ? 9 : 9.4, minZoom: 7, maxZoom: 15,
        attributionControl: { compact: true }, cooperativeGestures: window.matchMedia?.('(pointer: coarse)').matches,
      })
    } catch {
      setMapFailed(true) // WebGL unavailable: the list view below still works
      return undefined
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    let tileErrors = 0
    map.on('error', (e) => {
      if (e?.sourceId || /tile|style|fetch/i.test(e?.error?.message || '')) tileErrors += 1
      if (tileErrors === 4 && basemap !== 'none') { setNotice('Basemap tiles are unreachable; switched to the offline view. Data layers are unaffected.'); setBasemap('none') }
    })
    // If the remote style cannot load (offline, blocked, slow), fall back so data layers still render.
    const styleTimer = basemap === 'none' ? null : setTimeout(() => {
      if (!map.isStyleLoaded()) { setNotice('Basemap did not load in time; showing the offline view. Data layers are unaffected.'); setBasemap('none') }
    }, 8000)
    map.on('style.load', () => { clearTimeout(styleTimer); addLayers(map); setReady((r) => r + 1) })
    map.on('click', 'nodes', (e) => onSelectNode?.(e.features[0].properties.id))
    map.on('click', 'coverage-fill', (e) => {
      const f = e.features[0]
      setCell({ ...f.properties, lng: e.lngLat.lng, lat: e.lngLat.lat })
    })
    for (const layer of ['nodes', 'coverage-fill']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }
    return () => { clearTimeout(styleTimer); map.remove(); mapRef.current = null; setReady(false) }
  }, [basemap, compact, onSelectNode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getSource('coverage')) return
    map.getSource('coverage').setData(coverage)
    map.getSource('nodes').setData(nodesGeoJSON(nodes, now))
    map.getSource('events').setData(eventsGeoJSON(events, eventWindow, now))
    paintCoverage(map, view)
  }, [ready, coverage, nodes, events, eventWindow, view, now])

  useEffect(() => {
    const node = nodes.find((n) => n.id === selectedNodeId)
    if (node && mapRef.current) mapRef.current.easeTo({ center: [node.lng, node.lat], zoom: Math.max(mapRef.current.getZoom(), 11), duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 600 })
  }, [selectedNodeId, nodes])

  const s = coverage.summary
  const selected = nodes.find((n) => n.id === selectedNodeId)
  const selectedInputs = coverage.nodes.find((n) => n.id === selectedNodeId)
  const flyTo = (lng, lat) => mapRef.current?.easeTo({ center: [lng, lat], zoom: 12 })

  return (
    <Card eyebrow="Trishuli · Bhote Koshi" title={t('map')} className="p-0 sm:p-4" actions={
      <div className="flex flex-wrap gap-2">
        <SegmentedControl size="sm" label="Map layer" value={view} onChange={setView} options={[{ value: 'coverage', label: t('coverage') }, { value: 'gap', label: 'Gap priority' }, { value: 'off', label: 'Nodes only' }]} />
      </div>
    }>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative">
          <div ref={container} className={compact ? 'h-72 w-full overflow-hidden rounded-xl border border-line sm:h-96' : 'h-[60vh] min-h-80 w-full overflow-hidden rounded-xl border border-line'}
            role="region" aria-label="Interactive corridor map. Use arrow keys to pan and plus/minus to zoom when focused. A list view of the same data follows." tabIndex={0} />
          {mapFailed && <p className="absolute inset-0 grid place-items-center rounded-xl bg-surface p-4 text-center text-sm text-muted">The map needs WebGL, which is unavailable here. Use the node and gap lists below.</p>}
          {notice && <p role="status" className="absolute top-2 left-2 max-w-xs rounded-lg bg-raised/95 px-3 py-2 text-xs shadow">{notice}</p>}
        </div>
        <aside className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0">
          <label className="block text-sm text-ink">{t('freshness')}: <b>{maxAge} min</b>
            <input type="range" min="5" max="240" step="5" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} className="mt-1 w-full accent-[var(--bd-accent)]" aria-describedby="fresh-help" />
            <span id="fresh-help" className="block text-xs text-muted">A node counts fully for 5 min after its last reading, then fades to zero at this limit.</span>
          </label>
          <label className="block text-sm text-ink">Show events from the last
            <select value={eventWindow} onChange={(e) => setEventWindow(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-line bg-raised px-2 py-1.5">
              <option value={15}>15 minutes</option><option value={60}>1 hour</option><option value={360}>6 hours</option><option value={1440}>24 hours</option>
            </select>
          </label>
          <label className="block text-sm text-ink">Basemap
            <select value={basemap} onChange={(e) => { setNotice(''); setBasemap(e.target.value) }} className="mt-1 block w-full rounded-lg border border-line bg-raised px-2 py-1.5">
              {Object.entries(BASEMAPS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}
            </select>
          </label>
          <CoverageLegend view={view} />
          <div className="rounded-xl bg-surface p-3 text-sm" aria-live="polite">
            <p><b>{s.covered + s.partial}</b> of {s.cells} cells have any coverage; <b>{s.high_risk_uncovered}</b> of {s.high_risk_cells} higher-risk cells are uncovered.</p>
            <p className="mt-1 text-xs text-muted">Indicative only: assumed sensing ranges, no terrain or radio model. {s.nodes_contributing} node(s) contributing.</p>
          </div>
          {cell && (
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="font-medium">Cell at {cell.lat.toFixed(3)}, {cell.lng.toFixed(3)}</p>
              <p>Coverage {Math.round(cell.coverage * 100)}% ({t(cell.band)}) · risk proxy {Math.round(cell.risk * 100)}% · {cell.contributors} node(s)</p>
              <Button variant="ghost" className="mt-1 px-0" onClick={() => setCell(null)}>Close</Button>
            </div>
          )}
          {selected && (
            <div className="rounded-xl border border-accent/40 p-3 text-sm">
              <p className="font-medium">{selected.name} <span className="font-mono text-xs text-muted">{selected.id}</span></p>
              <p className="text-muted">{formatAge(selected.last_seen, now)} · {selected.status}{selected.demo ? ' · demo' : ''}</p>
              {selectedInputs && <p className="mt-1 text-xs">range {selectedInputs.range_km} km × freshness {selectedInputs.freshness.toFixed(2)} × reliability {selectedInputs.reliability.toFixed(2)}</p>}
            </div>
          )}
        </aside>
      </div>
      {!compact && (
        <details className="mx-4 mt-4 mb-4 rounded-xl border border-line p-3 sm:mx-0 sm:mb-0">
          <summary className="cursor-pointer text-sm font-medium">List view: node contributions and top coverage gaps</summary>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <table className="w-full text-sm">
              <caption className="mb-1 text-left text-xs text-muted">Per-node coverage inputs</caption>
              <thead className="text-left text-xs text-muted"><tr><th scope="col">Node</th><th scope="col">Range</th><th scope="col">Fresh</th><th scope="col">Reliab.</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{coverage.nodes.map((n) => <tr key={n.id} className="border-t border-line"><th scope="row" className="py-1 text-left font-mono font-normal">{n.id}</th><td>{n.range_km} km</td><td>{n.freshness.toFixed(2)}</td><td>{n.reliability.toFixed(2)}</td><td><Button variant="ghost" className="min-h-0 py-0" onClick={() => onSelectNode?.(n.id)}>Show</Button></td></tr>)}</tbody>
            </table>
            <table className="w-full text-sm">
              <caption className="mb-1 text-left text-xs text-muted">Highest gap-priority cells</caption>
              <thead className="text-left text-xs text-muted"><tr><th scope="col">Location</th><th scope="col">Risk</th><th scope="col">Coverage</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{topGaps.map((f) => { const [lng, lat] = f.geometry.coordinates[0][0]; return <tr key={f.id} className="border-t border-line"><th scope="row" className="py-1 text-left font-mono font-normal">{(lat + 0.01).toFixed(2)}, {(lng + 0.01).toFixed(2)}</th><td>{Math.round(f.properties.risk * 100)}%</td><td>{Math.round(f.properties.coverage * 100)}%</td><td><Button variant="ghost" className="min-h-0 py-0" onClick={() => flyTo(lng + 0.01, lat + 0.01)}>Show</Button></td></tr> })}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Method: docs/COVERAGE.md. Settlement markers: {settlements.length} (used only as exposure weights). <Badge tone="neutral">coverage model v{coverageModel.version}</Badge></p>
        </details>
      )}
    </Card>
  )
}
