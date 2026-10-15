import { useEffect, useMemo, useRef, useState } from 'react'
import { freshnessState } from '@shared/freshness.js'
import { useI18n } from './lib/i18n.jsx'
import { useLiveData } from './lib/useLiveData.js'
import { PORTAL_TABS as TABS, focusTarget, parseRoute } from './lib/route.js'
import { AgentsPanel } from './components/Agents.jsx'
import { AlertsPanel } from './components/Alerts.jsx'
import { CapturePanel, useWebQueue } from './components/Capture.jsx'
import { CorridorMap } from './components/CorridorMap.jsx'
import { DeviceList } from './components/Devices.jsx'
import { EventDetail, EventFeed } from './components/EventFeed.jsx'
import { SettingsPanel } from './components/Settings.jsx'
import { Disclaimer, StatusBar } from './components/StatusBar.jsx'
import { AnimatedNumber, Card, cx, useNow } from './components/ui.jsx'

function useHashTab(initial) {
  const read = () => {
    const r = parseRoute(window.location.hash)
    return r.view === 'portal' ? r.tab : null
  }
  const [tab, setTab] = useState(() => read() || initial || 'overview')
  useEffect(() => {
    const on = () => { const next = read(); if (next) setTab(next) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (next) => { window.history.replaceState(null, '', `#${next}`); setTab(next) }
  return [tab, go]
}

const TAB_ICONS = {
  overview: 'M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z',
  map: 'm4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Zm5-2v14m6-12v14',
  events: 'M4 12h3l2-5 4 10 2-5h5',
  devices: 'M7 7h10v10H7V7Zm3-3v3m4-3v3m-4 10v3m4-3v3M4 10h3m10 0h3M4 14h3m10 0h3',
  alerts: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4',
  agents: 'M12 3 4 7v5c0 4.5 3.2 7.5 8 9 4.8-1.5 8-4.5 8-9V7l-8-4Zm-3 9 2 2 4-4',
  capture: 'M4 12h3m10 0h3M12 4v3m0 10v3m-5-5-2 2m14-10-2 2m0 6 2 2M5 7l2 2m5 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4',
}

function TabIcon({ id }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={TAB_ICONS[id]} /></svg>
}

function Tabs({ tab, onChange, counts }) {
  const { t } = useI18n()
  const refs = useRef({})
  const label = { overview: t('overview'), map: t('map'), events: t('events'), devices: t('devices'), alerts: t('alerts'), agents: t('agents'), capture: t('capture'), settings: t('settings') }
  const onKey = (e) => {
    const i = TABS.indexOf(tab)
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i - 1 + TABS.length) % TABS.length] : null
    if (next) { e.preventDefault(); onChange(next); refs.current[next]?.focus() }
  }
  return (
    <nav aria-label="Sections" className="portal-nav">
      <div role="tablist" aria-orientation="horizontal" onKeyDown={onKey} className="portal-tablist">
        {TABS.map((id) => (
          <button key={id} ref={(el) => { refs.current[id] = el }} id={`tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls="panel" tabIndex={tab === id ? 0 : -1}
            onClick={() => onChange(id)}
            className={cx('portal-tab', tab === id ? 'portal-tab-active text-ink' : 'text-muted hover:text-ink')}>
            <TabIcon id={id} />
            <span className="portal-tab-label">{label[id]}</span>
            {counts[id] > 0 && <span className="portal-tab-count">{counts[id]}</span>}
            <span aria-hidden="true" className="portal-tab-indicator" />
          </button>
        ))}
      </div>
    </nav>
  )
}

function Metric({ label, value, detail, tone }) {
  return (
    <div className="metric-card group rounded-2xl border border-line bg-raised p-3 motion-safe:animate-rise">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tracking-tight tabular-nums transition-transform duration-300 group-hover:translate-x-0.5', tone)}><AnimatedNumber value={value} /></p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  )
}

export default function Portal({ initialTab }) {
  const { state, refresh } = useLiveData()
  const now = useNow(15000)
  const queue = useWebQueue()
  const [tab, setTab] = useHashTab(initialTab)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const { nodes, events, alerts, settlements } = state

  const stats = useMemo(() => {
    const fresh = nodes.filter((n) => ['live', 'recent'].includes(freshnessState(n.last_seen, now))).length
    const hour = events.filter((e) => now - Date.parse(e.recorded_at) < 3600e3)
    return {
      fresh,
      esp32: hour.filter((e) => e.source === 'esp32_node').length,
      phone: hour.filter((e) => e.source === 'phone_layer').length,
      detections: hour.filter((e) => e.classification?.classification === 'event').length,
      confirmed: hour.filter((e) => e.cross_confirmation?.cross_confirmed).length,
      pending: alerts.filter((a) => a.status === 'pending_approval').length,
    }
  }, [nodes, events, alerts, now])

  const chooseEvent = (id) => { setSelectedEvent(id); if (tab !== 'events') setTab('events') }
  const event = events.find((e) => e.id === selectedEvent) || events[0]
  const offline = state.dataOrigin === 'fixture'

  return (
    <div className="portal-shell min-h-screen pb-24 xl:pb-10">
      {/* Skip link focuses the panel without touching the hash, which drives routing. */}
      <a href="#panel" onClick={(e) => { e.preventDefault(); focusTarget('panel') }} className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2">Skip to content</a>
      <StatusBar state={state} now={now} queue={queue.status} />
      <div className="mx-auto grid max-w-[90rem] xl:grid-cols-[13rem_minmax(0,1fr)] xl:gap-5 xl:px-4">
        <Tabs tab={tab} onChange={setTab} counts={{ alerts: stats.pending, capture: queue.status.pending }} />
        <div className="min-w-0">
          <Disclaimer />
          <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1} className="space-y-4 px-4 pt-3 xl:px-0">
          <div key={tab} className="portal-panel space-y-4">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Nodes reporting (≤15 min)" value={stats.fresh} detail={`of ${nodes.length} registered`} />
              <Metric label="ESP32 readings · 1 h" value={stats.esp32} />
              <Metric label="Phone readings · 1 h" value={stats.phone} />
              <Metric label="Detections · 1 h" value={stats.detections} tone={stats.detections ? 'text-watch' : ''} />
              <Metric label="Cross-confirmed · 1 h" value={stats.confirmed} />
              <Metric label="Alerts awaiting review" value={stats.pending} tone={stats.pending ? 'text-advisory' : ''} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <CorridorMap compact nodes={nodes} events={events} settlements={settlements} now={now} selectedNodeId={selectedNode} onSelectNode={setSelectedNode} />
              <div className="space-y-4">
                <AlertsPanel alerts={alerts.slice(0, 3)} now={now} onChanged={refresh} />
                <EventFeed compact events={events} now={now} limit={6} onSelect={chooseEvent} selectedId={selectedEvent} />
              </div>
            </div>
          </>
        )}
        {tab === 'map' && <CorridorMap nodes={nodes} events={events} settlements={settlements} now={now} selectedNodeId={selectedNode} onSelectNode={setSelectedNode} />}
        {tab === 'events' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <EventFeed events={events} now={now} onSelect={setSelectedEvent} selectedId={event?.id} />
            <Card eyebrow="Provenance & signal" title="Reading detail"><EventDetail event={event} now={now} /></Card>
          </div>
        )}
        {tab === 'devices' && <DeviceList nodes={nodes} now={now} selectedId={selectedNode} onSelect={(id) => { setSelectedNode(id); setTab('map') }} />}
        {tab === 'alerts' && <AlertsPanel alerts={alerts} now={now} onChanged={refresh} />}
        {tab === 'agents' && <AgentsPanel disabled={offline} />}
        {tab === 'capture' && <CapturePanel nodes={nodes} queue={queue} />}
          {tab === 'settings' && <SettingsPanel config={state.config} onSimulated={refresh} />}
          </div>
          </main>
        </div>
      </div>
    </div>
  )
}
