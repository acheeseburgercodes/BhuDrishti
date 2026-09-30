import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import './tactical-ui.css'
import './globe.css'
import './layout-fixes.css'
// Legacy "tactical" dashboard, preserved at /#legacy. Superseded by src/App.jsx.
import GlobeStudy from './globe-study-source'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS = API.replace(/^http/, 'ws') + '/ws/live'
const fallbackNodes = [
  { id: 'BD-001', name: 'Chatara Bridge', lat: 26.875, lng: 87.162, status: 'online', battery_pct: 92 },
  { id: 'BD-002', name: 'Barahakshetra', lat: 26.817, lng: 87.154, status: 'online', battery_pct: 78 },
]

const tone = (label) => label === 'critical' || label === 'event' ? 'critical' : label === 'watch' ? 'watch' : 'normal'
const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'

function App() {
  const [nodes, setNodes] = useState([])
  const [settlements, setSettlements] = useState([])
  const [gaps, setGaps] = useState([])
  const [events, setEvents] = useState([])
  const [selectedNode, setSelectedNode] = useState('')
  const [connection, setConnection] = useState('connecting')
  const [severity, setSeverity] = useState('random')
  const [loading, setLoading] = useState(true)
  const [phoneMonitoring, setPhoneMonitoring] = useState(false)
  const [phoneStatus, setPhoneStatus] = useState('')
  const [incomingSignal, setIncomingSignal] = useState(null)
  const [activeNav, setActiveNav] = useState('gis')
  const phoneWindow = useRef([])
  const lastPhoneAlert = useRef(0)
  const seenEventIds = useRef(new Set())
  const alertTimer = useRef(null)

  const raiseUrgentAlert = useCallback((event) => {
    if (event.classification?.classification !== 'event') return
    setIncomingSignal(event)
    window.clearTimeout(alertTimer.current)
    alertTimer.current = window.setTimeout(() => setIncomingSignal(null), 12000)
  }, [])

  const applyTelemetryEvent = useCallback((event, announce = true) => {
    if (!event?.id) return
    if (announce && !seenEventIds.current.has(event.id)) raiseUrgentAlert(event)
    seenEventIds.current.add(event.id)
    setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 60))
    setNodes((current) => {
      const updated = current.map((node) => node.id === event.node_id
        ? { ...node, name: event.node_name || node.name, lat: event.lat ?? node.lat, lng: event.lng ?? node.lng, status: event.classification?.classification === 'normal' ? 'online' : 'critical', battery_pct: event.telemetry?.battery_pct, last_seen: event.recorded_at }
        : node)
      if (updated.some((node) => node.id === event.node_id)) return updated
      return [...updated, { id: event.node_id, name: event.node_name || event.node_id, lat: event.lat, lng: event.lng, status: 'critical', battery_pct: event.telemetry?.battery_pct, source: event.source }]
    })
  }, [raiseUrgentAlert])

  const loadInitial = useCallback(async () => {
    try {
      const [nodeResponse, settlementResponse, gapResponse, eventResponse] = await Promise.all(
        ['nodes', 'settlements', 'coverage-gaps', 'events'].map((path) => fetch(`${API}/api/${path}`)),
      )
      const [nodeData, settlementData, gapData, eventData] = await Promise.all(
        [nodeResponse, settlementResponse, gapResponse, eventResponse].map((response) => response.json()),
      )
      setNodes(nodeData)
      setSettlements(settlementData)
      setGaps(gapData)
      setEvents(eventData)
      eventData.forEach((event) => seenEventIds.current.add(event.id))
      setSelectedNode((current) => current || nodeData[0]?.id || '')
    } catch (error) {
      console.warn('API unavailable; showing the local map shell', error)
      setNodes(fallbackNodes)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadInitial() }, [loadInitial])

  useEffect(() => {
    const refreshEvents = async () => {
      try {
        const [eventResponse, nodeResponse] = await Promise.all([
          fetch(`${API}/api/events?limit=60`),
          fetch(`${API}/api/nodes`),
        ])
        if (!eventResponse.ok || !nodeResponse.ok) return
        const nextEvents = await eventResponse.json()
        nextEvents.forEach((event) => applyTelemetryEvent(event))
        setNodes(await nodeResponse.json())
      } catch (error) {
        console.warn('Live event refresh failed', error)
      }
    }
    const interval = window.setInterval(refreshEvents, 3000)
    return () => window.clearInterval(interval)
  }, [applyTelemetryEvent])

  useEffect(() => {
    let socket
    let retry
    const connect = () => {
      try {
        socket = new WebSocket(WS)
        socket.onopen = () => setConnection('live')
        socket.onclose = () => {
          setConnection('offline')
          retry = setTimeout(connect, 4000)
        }
        socket.onerror = () => setConnection('offline')
        socket.onmessage = (message) => {
          const data = JSON.parse(message.data)
          if (data.type === 'snapshot') {
            setEvents(data.events || [])
            ;(data.events || []).forEach((event) => seenEventIds.current.add(event.id))
            if (data.nodes?.length) setNodes(data.nodes)
          }
          if (data.type === 'telemetry' && data.event) applyTelemetryEvent(data.event)
        }
      } catch {
        setConnection('offline')
      }
    }
    connect()
    return () => { clearTimeout(retry); socket?.close() }
  }, [applyTelemetryEvent])

  const sendPhoneDetection = useCallback(async (window) => {
    if (!selectedNode) return
    await fetch(`${API}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: selectedNode, source: 'phone_layer', sensor_window: window }),
    })
  }, [selectedNode])

  const onDeviceMotion = useCallback((event) => {
    const acceleration = event.accelerationIncludingGravity
    if (!acceleration) return
    const magnitude = Math.sqrt((acceleration.x || 0) ** 2 + (acceleration.y || 0) ** 2 + (acceleration.z || 0) ** 2) - 9.8
    phoneWindow.current = [...phoneWindow.current, magnitude].slice(-200)
    const peak = Math.max(...phoneWindow.current.map((value) => Math.abs(value)))
    if (phoneWindow.current.length >= 40 && peak > 4 && Date.now() - lastPhoneAlert.current > 30000) {
      lastPhoneAlert.current = Date.now()
      sendPhoneDetection(phoneWindow.current).catch((error) => {
        console.warn('Phone detection relay failed', error)
        setPhoneStatus('Could not relay motion data to the backend.')
      })
      phoneWindow.current = []
    }
  }, [sendPhoneDetection])

  useEffect(() => () => {
    window.removeEventListener('devicemotion', onDeviceMotion)
  }, [onDeviceMotion])

  const togglePhoneMonitoring = async () => {
    if (phoneMonitoring) {
      window.removeEventListener('devicemotion', onDeviceMotion)
      setPhoneMonitoring(false)
      setPhoneStatus('Phone motion monitoring paused.')
      return
    }
    if (typeof window.DeviceMotionEvent === 'undefined') {
      setPhoneStatus('Motion sensors are unavailable in this browser. Open the portal on a phone.')
      return
    }
    try {
      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        const permission = await window.DeviceMotionEvent.requestPermission()
        if (permission !== 'granted') {
          setPhoneStatus('Motion permission was denied. Allow sensor access and try again.')
          return
        }
      }
    } catch (error) {
      console.warn('Motion permission request failed', error)
      setPhoneStatus('Motion permission could not be requested. Use HTTPS or localhost on a phone.')
      return
    }
    window.addEventListener('devicemotion', onDeviceMotion)
    setPhoneMonitoring(true)
    setPhoneStatus('Phone motion monitoring is active.')
  }

  const [modelInfo, setModelInfo] = useState({
    model_type: 'Logistic Regression',
    features: ['peak_amplitude','rms','zero_crossing_rate','dominant_frequency_hz','decay_envelope'],
    training_samples: 8000,
    validation_samples: 2000,
    validation_accuracy: 0.9995,
    validation_balanced_accuracy: 0.9995,
    labels: ['normal','event'],
    feature_importances: (() => {
      const coeffs = [3.4654, 4.6616, -1.9588, 0.0881, 4.8281]
      const features = ['peak_amplitude','rms','zero_crossing_rate','dominant_frequency_hz','decay_envelope']
      const total = coeffs.reduce((s,c) => s + Math.abs(c), 0)
      return features.map((f,i) => ({ feature: f, coefficient: coeffs[i], importance: Math.abs(coeffs[i])/total }))
    })(),
    note: 'Trained on synthetic vibration windows. Replace synthetic_training_data() with labelled field/USGS data for production.'
  })

  useEffect(() => {
    fetch(`${API}/api/model`).then(r => r.json()).then(d => { if (d.validation_accuracy) setModelInfo(d) }).catch(() => {})
  }, [])

  const latestByNode = useMemo(() => Object.fromEntries(events.map((event) => [event.node_id, event])), [events])
  const latestWindow = events[0]?.telemetry?.sensor_window || []
  const chartData = useMemo(() => latestWindow.map((value, index) => ({ index, amplitude: value })), [latestWindow])
  const counts = useMemo(() => nodes.reduce((acc, node) => {
    const label = latestByNode[node.id]?.classification?.classification === 'event' ? 'critical' : latestByNode[node.id]?.classification?.classification || (node.status === 'warning' ? 'watch' : 'normal')
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, { normal: 0, watch: 0, critical: 0 }), [latestByNode, nodes])

  const simulate = async () => {
    try {
      await fetch(`${API}/api/simulate-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: selectedNode || null, severity }),
      })
    } catch (error) {
      console.warn('Could not simulate event', error)
    }

  }

  const navigateTo = (target, section) => {
    setActiveNav(section)
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="app-shell">
      <GradientWaves />
      {incomingSignal && <PixelSignalCard event={incomingSignal} onDismiss={() => setIncomingSignal(null)} />}
      <header className="topbar tactical-topbar">
        <div className="brand"><div className="brand-mark">⌂</div><div><strong>NEPAL NDRRMA · TACTICAL EWS</strong><span>TRISHULI &amp; BHOTE KOSHI HIMALAYAN GLACIAL GRID</span></div></div>
        <div className="tactical-time">ZULU: 23:29:54Z <b>|</b> NPT: 05:14:54 (+5:45) <span className="connection"><i /> {connection === 'live' ? 'WS: 12ms SYNC' : connection.toUpperCase()}</span></div>
        <div className="tactical-actions"><span className="defcon">⚠ DEFCON 2: ELEVATED WATCH</span><nav aria-label="Dashboard sections">
          <button className={activeNav === 'gis' ? 'active' : ''} onClick={() => navigateTo('corridor-gis', 'gis')}>CORRIDOR GIS</button>
          <button className={activeNav === 'cascade' ? 'active' : ''} onClick={() => navigateTo('cascade-simulation', 'cascade')}>CASCADE SIMULATION</button>
          <button className={activeNav === 'ml' ? 'active' : ''} onClick={() => navigateTo('ml-telemetry', 'ml')}>ML TELEMETRY</button>
          <button className={activeNav === 'logs' ? 'active' : ''} onClick={() => navigateTo('system-logs', 'logs')}>SYSTEM LOGS</button>
        </nav></div>
      </header>
      <section className="content">
        <div className="headline"><div className="headline-copy"><p className="eyebrow">FIELD INTELLIGENCE / 07 SEP 2026</p><h1>Advanced<br /><em>Seismic Alert System</em></h1><div className="headline-note">A living picture of river pressure, community exposure and the last mile of warning.</div></div><GlobePanel nodes={nodes} settlements={settlements} /></div>
        <div className="metrics tactical-metrics">
          <Metric label="ACTIVE NODES" value={nodes.filter((n) => n.status !== 'offline').length} unit={`/ ${nodes.length || '--'}`} detail="connected to network" />
          <Metric label="RISK WATCH" value={counts.watch + counts.critical} unit=" nodes" detail="requiring attention" accent="amber" />
          <Metric label="COVERAGE GAPS" value={gaps.length || '—'} unit=" zones" detail="blind spots in corridor" accent="red" />
          <Metric label="LAST SIGNAL" value={events[0] ? formatTime(events[0].recorded_at) : '—'} detail={events[0]?.node_name || 'Awaiting telemetry'} accent="blue" />
          <Metric label="ESP32 SIGNALS" value={events.filter(e => e.source === 'esp32_node').length} unit=" total" detail={events.find(e => e.source === 'esp32_node') ? formatTime(events.find(e => e.source === 'esp32_node').recorded_at) : 'none yet'} accent="teal" />
          <Metric label="PHONE SIGNALS" value={events.filter(e => e.source === 'phone_layer').length} unit=" total" detail={events.find(e => e.source === 'phone_layer') ? formatTime(events.find(e => e.source === 'phone_layer').recorded_at) : 'none yet'} accent="teal" />
        </div>
        <div className="dashboard-grid">
          <section id="corridor-gis" className="map-card panel">
            <div className="panel-head"><div><p className="eyebrow">CORRIDOR MAP / 01</p><h2>Signal landscape</h2></div><div className="legend"><span><i className="dot normal" /> normal</span><span><i className="dot watch" /> watch</span><span><i className="dot critical" /> critical</span></div></div>
            <div className="map-wrap">
              <div className="map-hud"><div className="map-modes"><b>3D TOPO GLOBE</b><span>2D VECTOR CORRIDOR</span><span>HYDROLOGIC MESH</span></div><div className="map-filters"><i>● NODE MESH ({nodes.length})</i><i>● GAP ZONES ({gaps.length})</i><i>● SETTLEMENT RADII ({settlements.length})</i></div></div>
              <MapContainer center={[28.05, 85.25]} zoom={10} scrollWheelZoom className="map">
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {gaps.map((gap) => <Circle key={gap.id} center={[gap.lat, gap.lng]} radius={gap.radius_km * 1000} pathOptions={{ color: '#ef6b5b', fillColor: '#ef6b5b', fillOpacity: 0.08, dashArray: '5 8' }}><Popup><b>{gap.name}</b><br />{gap.reason}</Popup></Circle>)}
                {settlements.map((settlement) => <CircleMarker key={settlement.id} center={[settlement.lat, settlement.lng]} radius={5} pathOptions={{ color: '#f0b85b', fillColor: '#f0b85b', fillOpacity: 0.9 }}><Popup>{settlement.name} · {settlement.population?.toLocaleString()} people</Popup></CircleMarker>)}
                {nodes.map((node) => {
                  const label = latestByNode[node.id]?.classification?.classification || (node.status === 'warning' ? 'watch' : node.status === 'offline' ? 'critical' : 'normal')
                  return <CircleMarker key={node.id} center={[node.lat, node.lng]} radius={8} pathOptions={{ color: `var(--${tone(label)})`, fillColor: `var(--${tone(label)})`, fillOpacity: 1, weight: 3 }} eventHandlers={{ click: () => setSelectedNode(node.id) }}><Popup><b>{node.name}</b><br />{label.toUpperCase()} · {node.battery_pct}% battery</Popup></CircleMarker>
                })}
              </MapContainer>
              <div className="map-label">TRISHULI · BHOTE KOSHI<br /><span>28°03′N · 85°15′E</span></div>
            </div>
          </section>
          <aside className="side-column">
            <section id="ml-telemetry" className="panel waveform"><div className="panel-head"><div><p className="eyebrow">LIVE VIBRATION / 02</p><h2>Sensor waveform</h2></div><span className="unit">AMPLITUDE</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#45c5c1" stopOpacity={0.45} /><stop offset="95%" stopColor="#45c5c1" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="2 5" stroke="#28404a" /><XAxis dataKey="index" tick={{ fill: '#6e898e', fontSize: 9 }} /><YAxis tick={{ fill: '#6e898e', fontSize: 9 }} width={28} /><Tooltip contentStyle={{ background: '#0c202b', border: '1px solid #2e5159', fontSize: 11 }} /><Area type="monotone" dataKey="amplitude" stroke="#45c5c1" fill="url(#water)" strokeWidth={2} name="vibration" /></AreaChart></ResponsiveContainer></div>
              <div className="chart-footer">
                <span><b className="teal">{events[0]?.classification?.classification || '—'}</b> · {events[0]?.classification?.confidence ? `${Math.round(events[0].classification.confidence * 100)}% confidence` : 'awaiting signal'}</span>
                <span style={{color: events[0]?.source === 'phone_layer' ? '#5d9cec' : '#45c5c1'}}>{events[0]?.source === 'phone_layer' ? '📱 PHONE' : events[0]?.source === 'esp32_node' ? '⌁ ESP32' : '—'}</span>
                <span>{latestWindow.length || 0} samples</span>
              </div>
              {events[0]?.classification?.features && <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'4px',marginTop:'8px',fontSize:'10px',color:'#6e898e'}}>
                <span>peak: <b style={{color:'#e0e8f5'}}>{events[0].classification.features.peak_amplitude?.toFixed(3)}</b></span>
                <span>rms: <b style={{color:'#e0e8f5'}}>{events[0].classification.features.rms?.toFixed(3)}</b></span>
                <span>zcr: <b style={{color:'#e0e8f5'}}>{events[0].classification.features.zero_crossing_rate?.toFixed(3)}</b></span>
                <span>fft: <b style={{color:'#e0e8f5'}}>{events[0].classification.features.dominant_freq_hz?.toFixed(1)}Hz</b></span>
                <span>dur: <b style={{color:'#e0e8f5'}}>{events[0].classification.features.duration_s?.toFixed(2)}s</b></span>
                <span>decay: <b style={{color:'#e0e8f5'}}>{events[0].classification.features.decay_envelope?.toFixed(3)}</b></span>
              </div>}
            </section>
            <section className="panel node-list"><div className="panel-head"><div><p className="eyebrow">FIELD DEVICES / 03</p><h2>Node health</h2></div><span className="unit">{nodes.length} total</span></div><div className="nodes">{loading ? <div className="empty">Loading corridor data…</div> : nodes.map((node) => <button className={`node-row ${selectedNode === node.id ? 'selected' : ''}`} key={node.id} onClick={() => setSelectedNode(node.id)}><span className={`node-icon ${tone(latestByNode[node.id]?.classification?.classification || 'normal')}`}>⌁</span><span className="node-info"><b>{node.name}</b><small>{node.id} · {node.last_seen ? formatTime(node.last_seen) : 'no signal'}</small></span><span className="battery">{Math.round(node.battery_pct || 0)}%</span><i className={`status-dot ${node.status === 'offline' ? 'off' : ''}`} /></button>)}</div></section>
          </aside>
        </div>
        <section className="bottom-grid">
          <section id="system-logs" className="panel event-feed"><div className="panel-head"><div><p className="eyebrow">DECISION LOG / 04</p><h2>Recent signal interpretations</h2></div><span className="model-tag">MODEL · LOGISTIC REGRESSION</span></div>
            <div style={{display:'flex',gap:'12px',marginBottom:'10px'}}>
              <span style={{fontSize:'11px',padding:'3px 10px',borderRadius:'12px',background:'rgba(69,197,193,0.15)',color:'#45c5c1',border:'1px solid rgba(69,197,193,0.3)'}}>⌁ ESP32 NODE</span>
              <span style={{fontSize:'11px',padding:'3px 10px',borderRadius:'12px',background:'rgba(93,156,236,0.15)',color:'#5d9cec',border:'1px solid rgba(93,156,236,0.3)'}}>📱 PHONE LAYER</span>
              <span style={{fontSize:'11px',padding:'3px 10px',borderRadius:'12px',background:'rgba(240,184,91,0.15)',color:'#f0b85b',border:'1px solid rgba(240,184,91,0.3)'}}>⚡ CROSS-CONFIRMED</span>
            </div>
            {events.length ? <div className="events">{events.slice(0, 12).map((event) => <div className="event" key={event.id} style={{borderLeft: `3px solid ${event.source === 'phone_layer' ? '#5d9cec' : '#45c5c1'}`, paddingLeft:'8px', marginBottom:'6px'}}>
              <span className={`event-badge ${tone(event.classification.classification)}`}>{event.classification.classification}</span>
              <span className="event-node">
                <b>{event.node_name}</b>
                <small style={{color: event.source === 'phone_layer' ? '#5d9cec' : '#45c5c1'}}>{event.source === 'phone_layer' ? '📱 PHONE LAYER' : '⌁ ESP32 NODE'}{event.confirmation === 'cross-confirmed' ? ' · ⚡ CROSS-CONFIRMED' : ''}</small>
              </span>
              <span className="event-reading">{Math.round((event.classification.confidence || 0) * 100)}<small>% conf</small></span>
              <span className="event-reason" style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                <span>{event.classification.features?.peak_amplitude?.toFixed(3)} peak amp</span>
                {event.telemetry?.water_level_cm > 0 && <span style={{color:'#5d9cec',fontSize:'10px'}}>💧 {event.telemetry.water_level_cm}cm water</span>}
                {event.telemetry?.rainfall_mm > 0 && <span style={{color:'#5d9cec',fontSize:'10px'}}>🌧 {event.telemetry.rainfall_mm}mm rain</span>}
                {event.telemetry?.battery_pct && <span style={{color:'#6e898e',fontSize:'10px'}}>🔋 {event.telemetry.battery_pct}%</span>}
              </span>
              <time>{formatTime(event.recorded_at)}</time>
            </div>)}</div> : <div className="empty">No telemetry yet. Use the simulator to create a signal.</div>}
          </section>
          <section id="cascade-simulation" className="panel simulator"><p className="eyebrow">DEMO CONTROL / 05</p><h2>Send a signal</h2><p>Inject synthetic sensor data and watch the model classify it in real time.</p><label>NODE<select value={selectedNode} onChange={(e) => setSelectedNode(e.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.id} · {node.name}</option>)}</select></label><label>SCENARIO<select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="random">Random conditions</option><option value="normal">Normal river</option><option value="watch">Rising water</option><option value="critical">Flood threshold</option></select></label><button className="simulate" onClick={simulate}>Transmit ESP32 test signal <span>↗</span></button><button className={`simulate phone-button ${phoneMonitoring ? 'active' : ''}`} onClick={togglePhoneMonitoring}>{phoneMonitoring ? 'Stop phone motion monitor' : 'Enable phone motion monitor'} <span>⌁</span></button>{phoneStatus && <small className="source-note phone-status">{phoneStatus}</small>}<small className="source-note">ESP32 and phone are independent detection sources. Alerts within 30 seconds are cross-confirmed.</small></section>
        </section>
      </section>
        {modelInfo && modelInfo.validation_accuracy && <section className="model-intelligence" style={{margin:'0 0 24px',borderRadius:'12px',padding:'20px 24px'}}>
          <p className="eyebrow" style={{marginBottom:'8px'}}>ML INTELLIGENCE / 06</p>
          <h2 style={{fontSize:'18px',marginBottom:'16px',color:'#e0e8f5'}}>Model Metrics &amp; Feature Importances</h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'12px',marginBottom:'20px'}}>
            {[
              ['Model Type', (modelInfo.model_type || '').replace(' (sklearn)','')],
              ['Accuracy', (modelInfo.validation_accuracy * 100).toFixed(2) + '%'],
              ['Balanced Accuracy', (modelInfo.validation_balanced_accuracy * 100).toFixed(2) + '%'],
              ['Training Samples', modelInfo.training_samples?.toLocaleString()],
              ['Validation Samples', modelInfo.validation_samples?.toLocaleString()],
              ['Classes', modelInfo.labels?.join(' / ')],
            ].map(([label, value]) => (
              <div className="model-stat" key={label} style={{borderRadius:'8px',padding:'10px 12px'}}>
                <div style={{fontSize:'10px',color:'#6e898e',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'4px'}}>{label}</div>
                <div style={{fontSize:'16px',fontWeight:'700',color:'#45c5c1'}}>{value}</div>
              </div>
            ))}
          </div>
          <div className="feature-heading" style={{marginBottom:'8px',fontSize:'11px',textTransform:'uppercase',letterSpacing:'1px'}}>Feature Importances (normalised |coefficient|)</div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {[...(modelInfo.feature_importances || [])].sort((a,b) => b.importance - a.importance).map(fi => (
              <div key={fi.feature} style={{display:'grid',gridTemplateColumns:'180px 1fr 60px 60px',alignItems:'center',gap:'8px'}}>
                <span className="feature-name" style={{fontSize:'12px',fontFamily:'monospace'}}>{fi.feature}</span>
                <div style={{height:'8px',background:'#1e3a4a',borderRadius:'4px',overflow:'hidden'}}>
                  <div style={{height:'100%',width:(fi.importance*100)+'%',background: fi.coefficient > 0 ? '#e74c3c' : '#45c5c1',borderRadius:'4px',transition:'width .3s'}} />
                </div>
                <span style={{fontSize:'11px',color:'#6e898e',textAlign:'right'}}>{(fi.importance*100).toFixed(1)}%</span>
                <span style={{fontSize:'11px',color: fi.coefficient > 0 ? '#e74c3c' : '#45c5c1',textAlign:'right',fontFamily:'monospace'}}>{fi.coefficient > 0 ? '+' : ''}{fi.coefficient}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:'12px',fontSize:'11px',color:'#6e898e',fontStyle:'italic',borderTop:'1px solid #1e3a4a',paddingTop:'10px'}}>{modelInfo.note}</div>
          <div style={{marginTop:'8px',fontSize:'11px',color:'#6e898e'}}>
            Red bars = increases event probability · Teal bars = decreases event probability
          </div>
        </section>}
      <footer><span>BHUDRISHTI / OPEN FIELD PROTOTYPE</span><span>Explainable intelligence for the last mile</span><span>API {API.replace(/^https?:\/\//, '')}</span></footer>    </main>
  )
}

function GradientWaves() {
  return <div className="gradient-waves" aria-hidden="true"><span className="wave wave-one" /><span className="wave wave-two" /><span className="wave wave-three" /></div>
}

function GlobePanel({ nodes, settlements }) {
  return <div className="globe-background" aria-label="Interactive corridor globe"><GlobeStudy mode="dark" className="globe-study-embed" /><div className="globe-caption"><span><i className="globe-legend-node" /> sensor nodes</span><span><i className="globe-legend-settlement" /> settlements</span><b>DRAG · SCROLL · CLICK TO PIN</b></div></div>
}

function GlobeStudyCanvas({ nodes, settlements }) {
  const canvasRef = useRef(null)
  const interaction = useRef({ dragging: false, moved: false, x: 0, y: 0, lon: 0.2, lat: -0.15, zoom: 1 })
  const [pins, setPins] = useState([])
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    const points = [...nodes.map((point) => ({ ...point, kind: 'node' })), ...settlements.map((point) => ({ ...point, kind: 'settlement' }))]
    const resize = () => {
      const scale = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * scale
      canvas.height = canvas.clientHeight * scale
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }
    const toSphere = (point) => {
      const latitude = ((point.lat - 28.05) / 90) * Math.PI
      const longitude = ((point.lng - 85.3) / 180) * Math.PI
      return { x: Math.cos(latitude) * Math.sin(longitude), y: Math.sin(latitude), z: Math.cos(latitude) * Math.cos(longitude), point }
    }
    const rotate = (vector) => {
      const horizontalX = vector.x * Math.cos(interaction.current.lon) - vector.z * Math.sin(interaction.current.lon)
      const horizontalZ = vector.x * Math.sin(interaction.current.lon) + vector.z * Math.cos(interaction.current.lon)
      return { x: horizontalX, y: vector.y * Math.cos(interaction.current.lat) - horizontalZ * Math.sin(interaction.current.lat), z: vector.y * Math.sin(interaction.current.lat) + horizontalZ * Math.cos(interaction.current.lat) }
    }
    const draw = (time) => {
      if (!interaction.current.dragging) interaction.current.lon += 0.0015
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const radius = Math.min(width, height) * 0.39 * interaction.current.zoom
      const center = { x: width / 2, y: height / 2 }
      context.clearRect(0, 0, width, height)
      const glow = context.createRadialGradient(center.x - radius * .3, center.y - radius * .35, 0, center.x, center.y, radius * 1.15)
      glow.addColorStop(0, '#153b38')
      glow.addColorStop(.62, '#061716')
      glow.addColorStop(1, '#010202')
      context.fillStyle = glow
      context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.fill()
      context.save()
      context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.clip()
      context.strokeStyle = 'rgba(125, 225, 215, .16)'
      context.lineWidth = 0.7
      for (let latitude = -60; latitude <= 60; latitude += 30) {
        const y = center.y - Math.sin(latitude * Math.PI / 180) * radius
        const widthAtLatitude = Math.cos(latitude * Math.PI / 180) * radius
        context.beginPath(); context.ellipse(center.x, y, widthAtLatitude, radius * .18, 0, 0, Math.PI * 2); context.stroke()
      }
      for (let longitude = -60; longitude <= 60; longitude += 30) {
        context.beginPath(); context.ellipse(center.x, center.y, radius * Math.abs(Math.cos(longitude * Math.PI / 180)), radius, 0, 0, Math.PI * 2); context.stroke()
      }
      const projected = points.map(toSphere).map((point) => ({ ...rotate(point), point }))
      const visible = projected.filter((point) => point.z > -0.05)
      const nodePositions = visible.filter((point) => point.point.kind === 'node')
      nodePositions.slice(0, -1).forEach((point, index) => {
        const next = nodePositions[index + 1]
        context.beginPath()
        context.moveTo(center.x + point.x * radius, center.y - point.y * radius)
        context.quadraticCurveTo(center.x + (point.x + next.x) * radius / 2, center.y - (Math.max(point.y, next.y) + .14) * radius, center.x + next.x * radius, center.y - next.y * radius)
        context.strokeStyle = 'rgba(100, 228, 214, .5)'
        context.setLineDash([2, 5])
        context.stroke()
        context.setLineDash([])
        const travel = (time / 2600 + index * .16) % 1
        const px = point.x + (next.x - point.x) * travel
        const py = point.y + (next.y - point.y) * travel
        context.fillStyle = '#ffffff'; context.shadowColor = '#ffffff'; context.shadowBlur = 8
        context.beginPath(); context.arc(center.x + px * radius, center.y - py * radius, 2, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0
      })
      visible.sort((a, b) => a.z - b.z).forEach(({ x, y, z, point }) => {
        const px = center.x + x * radius
        const py = center.y - y * radius
        const color = point.kind === 'node' ? (point.status === 'offline' ? '#ff5e5e' : '#ffffff') : '#f2b95f'
        const pulse = (Math.sin(time / 420 + point.lat) + 1) / 2
        context.fillStyle = color; context.shadowColor = color; context.shadowBlur = 8 * z
        context.beginPath(); context.arc(px, py, point.kind === 'node' ? 2.4 : 1.6, 0, Math.PI * 2); context.fill()
        context.strokeStyle = `${color}${Math.floor((.25 + pulse * .5) * 255).toString(16).padStart(2, '0')}`
        context.lineWidth = 1; context.beginPath(); context.arc(px, py, 4 + pulse * 5, 0, Math.PI * 2); context.stroke(); context.shadowBlur = 0
      })
      context.restore()
      context.strokeStyle = 'rgba(100, 228, 214, .85)'; context.lineWidth = 1; context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.stroke()
      animation = window.requestAnimationFrame(draw)
    }
    let animation = 0
    resize()
    window.addEventListener('resize', resize)
    animation = window.requestAnimationFrame(draw)
    return () => { window.removeEventListener('resize', resize); window.cancelAnimationFrame(animation) }
  }, [nodes, settlements])
  const startDrag = (event) => {
    interaction.current = { ...interaction.current, dragging: true, moved: false, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event) => {
    if (!interaction.current.dragging) return
    interaction.current.moved = interaction.current.moved || Math.abs(event.clientX - interaction.current.x) + Math.abs(event.clientY - interaction.current.y) > 3
    interaction.current.lon += (event.clientX - interaction.current.x) * .008
    interaction.current.lat = Math.max(-1.1, Math.min(1.1, interaction.current.lat + (event.clientY - interaction.current.y) * .008))
    interaction.current.x = event.clientX; interaction.current.y = event.clientY
  }
  const finishInteraction = (event) => {
    if (interaction.current.dragging && !interaction.current.moved) {
      const bounds = event.currentTarget.getBoundingClientRect()
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
      setPins((current) => [...current.slice(-11), { x, y, createdAt: performance.now() }])
    }
    interaction.current.dragging = false
  }
  const zoom = (event) => {
    event.preventDefault()
    interaction.current.zoom = Math.max(.78, Math.min(1.35, interaction.current.zoom * Math.exp(-event.deltaY * .001)))
  }
  return <div className="globe-stage"><canvas ref={canvasRef} className="globe-canvas" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishInteraction} onPointerLeave={() => { interaction.current.dragging = false }} onWheel={zoom} aria-label="Interactive animated sensor globe" /><div className="globe-caption"><span><i className="globe-legend-node" /> sensor nodes</span><span><i className="globe-legend-settlement" /> settlements</span><b>DRAG · SCROLL · CLICK TO PIN</b></div>{pins.map((pin, index) => <span key={`${pin.createdAt}-${index}`} className="globe-pin" style={{ left: `${50 + pin.x * 50}%`, top: `${50 + pin.y * 50}%` }} />)}</div>
}

function PixelSignalCard({ event, onDismiss }) {
  const source = event.source === 'phone_layer' ? 'PHONE LAYER' : 'ESP32 NODE'
  return <div className="signal-alert-layer" role="alert">
    <article className="pixel-card">
      <div className="pixel-card-glow" />
      <div className="pixel-card-header"><span className="signal-kicker"><i /> URGENT · {source}</span><button onClick={onDismiss} aria-label="Dismiss alert">×</button></div>
      <div className="pixel-card-icon">!</div>
      <p className="eyebrow">COLLAPSE SIGNATURE DETECTED</p>
      <h2>{event.node_name}</h2>
      <p className="signal-copy">{source} reported an impulsive vibration pattern. {event.confirmation === 'cross-confirmed' ? 'Cross-confirmed by both detection layers.' : 'Awaiting independent source confirmation.'}</p>
      <div className="signal-facts"><span><b>{Math.round((event.classification.confidence || 0) * 100)}%</b> confidence</span><span><b>{event.classification.features?.peak_amplitude?.toFixed(2)}</b> peak amplitude</span></div>
      <button className="signal-ack" onClick={onDismiss}>Acknowledge signal <span>↗</span></button>
    </article>
  </div>
}

function Metric({ label, value, unit, detail, accent = 'teal' }) {
  return <div className="metric"><p className="eyebrow">{label}</p><div><strong className={accent}>{value}</strong><span>{unit}</span></div><small>{detail}</small></div>
}

export default App
