import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useApp } from '../store'
import { computeCoverage, coverageModel, formatAge, freshnessState } from '../shared'
import { Badge, Card } from '../components'
import { mapHtml } from '../mapHtml'
import { C, s } from '../theme'

const FRESH_TONE = { live: 'ok', recent: 'accent', stale: 'advisory', offline: 'danger', never: 'neutral' }
const rivers = { type: 'FeatureCollection', features: coverageModel.rivers.map((line) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.map(([lat, lng]) => [lng, lat]) } })) }

export function MapScreen() {
  const { data, t } = useApp()
  const web = useRef(null)
  const [mapState, setMapState] = useState('loading') // loading | ready | failed
  const [notice, setNotice] = useState('')
  const [maxAge, setMaxAge] = useState(60)
  const [selected, setSelected] = useState(null)
  const now = Date.now()
  const coverage = useMemo(() => computeCoverage({ nodes: data.nodes, settlements: data.settlements, model: coverageModel, asOf: now, maxAgeMinutes: maxAge }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.nodes, data.settlements, maxAge])
  const payload = useMemo(() => JSON.stringify({
    coverage, rivers,
    nodes: { type: 'FeatureCollection', features: data.nodes.filter((n) => Number.isFinite(n.lat)).map((n) => ({ type: 'Feature', properties: { id: n.id, fresh: freshnessState(n.last_seen, now) }, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } })) },
  }), [coverage, data.nodes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (mapState === 'ready') web.current?.postMessage(payload) }, [payload, mapState])
  useEffect(() => { const timer = setTimeout(() => setMapState((st) => (st === 'loading' ? 'failed' : st)), 20000); return () => clearTimeout(timer) }, [])

  const onMessage = (event) => {
    let msg
    try { msg = JSON.parse(event.nativeEvent.data) } catch { return }
    if (msg.type === 'ready') { setMapState('ready'); web.current?.postMessage(payload) }
    if (msg.type === 'error') setMapState('failed')
    if (msg.type === 'notice') setNotice('Basemap unavailable; showing data layers only.')
    if (msg.type === 'node') setSelected(msg.id)
  }
  const sm = coverage.summary
  const node = data.nodes.find((n) => n.id === selected)
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Card eyebrow="Trishuli · Bhote Koshi" title={t('map')}>
        {mapState !== 'failed' ? (
          <View style={{ height: 340, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line }} accessibilityLabel="Corridor map. A list of nodes follows below.">
            <WebView ref={web} originWhitelist={['*']} source={{ html: mapHtml }} onMessage={onMessage} onError={() => setMapState('failed')} javaScriptEnabled setSupportMultipleWindows={false} />
          </View>
        ) : <Text style={s.muted} accessibilityRole="alert">The map could not load (probably offline). The list below shows the same data.</Text>}
        {notice ? <Text style={[s.muted, { marginTop: 6 }]}>{notice}</Text> : null}
        <View style={[s.row, { marginTop: 10 }]}>
          <Text style={s.body}>{t('freshness')}:</Text>
          {[15, 60, 240].map((m) => (
            <TouchableOpacity key={m} accessibilityRole="radio" accessibilityState={{ checked: maxAge === m }} onPress={() => setMaxAge(m)} style={[s.btnSecondary, { minHeight: 40, paddingVertical: 6 }, maxAge === m && { borderColor: C.accent }]}>
              <Text style={s.btnSecondaryText}>{m < 60 ? `${m} min` : `${m / 60} h`}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[s.row, { marginTop: 10 }]}>
          <Badge tone="ok">{t('covered')}</Badge><Badge tone="advisory">{t('partial')}</Badge><Badge tone="danger">{t('uncovered')}</Badge>
        </View>
        <Text style={[s.muted, { marginTop: 8 }]}>{sm.covered + sm.partial} of {sm.cells} cells have some coverage; {sm.high_risk_uncovered} of {sm.high_risk_cells} higher-risk cells are uncovered. Indicative only: assumed sensing ranges, no terrain model.</Text>
      </Card>
      {node && (
        <Card eyebrow="Selected node" title={node.name}>
          <Text style={s.body}>{node.id} · {node.status} · {formatAge(node.last_seen, now)}</Text>
        </Card>
      )}
      <Card eyebrow={t('devices')}>
        {data.nodes.map((n) => (
          <TouchableOpacity key={n.id} accessibilityRole="button" onPress={() => setSelected(n.id)} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.body}>{n.name} <Text style={s.muted}>{n.id}</Text></Text>
              <Badge tone={FRESH_TONE[freshnessState(n.last_seen, now)]}>{formatAge(n.last_seen, now)}</Badge>
            </View>
          </TouchableOpacity>
        ))}
        {data.nodes.length === 0 && <Text style={s.muted}>No node data yet. Check the server address in Settings.</Text>}
      </Card>
    </ScrollView>
  )
}
