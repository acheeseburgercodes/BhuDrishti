import { useEffect, useMemo, useRef, useState } from 'react'
import { freshnessState } from '@shared/freshness.js'
import { LanguageProvider, useI18n } from './lib/i18n.jsx'
import { useLiveData } from './lib/useLiveData.js'
import { AgentsPanel } from './components/Agents.jsx'
import { AlertsPanel } from './components/Alerts.jsx'
import { CapturePanel, useWebQueue } from './components/Capture.jsx'
import { CorridorMap } from './components/CorridorMap.jsx'
import { DeviceList } from './components/Devices.jsx'
import { EventDetail, EventFeed } from './components/EventFeed.jsx'
import { SettingsPanel } from './components/Settings.jsx'
import { Disclaimer, StatusBar } from './components/StatusBar.jsx'
import { AnimatedNumber, Card, cx, useNow } from './components/ui.jsx'

const TABS = ['overview', 'map', 'events', 'devices', 'alerts', 'agents', 'capture', 'settings']

function useHashTab() {
  const read = () => {
    const h = window.location.hash.replace('#', '')
    return TABS.includes(h) ? h : 'overview'
  }
  const [tab, setTab] = useState(read)
  useEffect(() => {
    const on = () => setTab(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (next) => { window.history.replaceState(null, '', `#${next}`); setTab(next) }
  return [tab, go]
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
    <nav aria-label="Sections" className="border-b border-line bg-surface">
      <div role="tablist" aria-orientation="horizontal" onKeyDown={onKey} className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2">
        {TABS.map((id) => (
          <button key={id} ref={(el) => { refs.current[id] = el }} id={`tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls="panel" tabIndex={tab === id ? 0 : -1}
            onClick={() => onChange(id)}
            className={cx('relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors', tab === id ? 'text-ink' : 'text-muted hover:text-ink')}>
            {label[id]}
            {counts[id] > 0 && <span className="ml-1 rounded-full bg-advisory/15 px-1.5 text-xs text-advisory">{counts[id]}</span>}
            <span aria-hidden="true" className={cx('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent transition-transform duration-200', tab === id ? 'scale-x-100' : 'scale-x-0')} />
          </button>
        ))}
      </div>
    </nav>
  )
}

function Metric({ label, value, detail, tone }) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-3 motion-safe:animate-rise">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tabular-nums', tone)}><AnimatedNumber value={value} /></p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  )
}

function Dashboard() {
  const { state, refresh } = useLiveData()
  const now = useNow(15000)
  const queue = useWebQueue()
  const [tab, setTab] = useHashTab()
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
    <div className="min-h-screen pb-10">
      <a href="#panel" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2">Skip to content</a>
      <StatusBar state={state} now={now} queue={queue.status} />
      <Tabs tab={tab} onChange={setTab} counts={{ alerts: stats.pending, capture: queue.status.pending }} />
      <Disclaimer />
      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1} className="mx-auto max-w-7xl space-y-4 px-4 pt-3">
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
      </main>
    </div>
  )
}

export default function App() {
  return <LanguageProvider><Dashboard /></LanguageProvider>
}
