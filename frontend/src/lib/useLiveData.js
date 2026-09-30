import { useCallback, useEffect, useReducer, useRef } from 'react'
import { API, WS_URL, apiFetch } from './api.js'
import { initialLiveState, liveReducer } from './liveState.js'
import seed from '../../../nepal-flood-corridor-seed-data.json'

const now = () => new Date().toISOString()

/** Offline fallback: bundled fixture, clearly labelled, with freshness relative to load time. */
function fixtureState() {
  const t = Date.now()
  return {
    nodes: seed.nodes.map(({ demo_last_seen_offset_s: offset, ...n }) => ({ ...n, demo: true, last_seen: offset != null ? new Date(t - offset * 1000).toISOString() : null })),
    settlements: seed.settlements,
    events: [],
    alerts: [],
    config: { mode: 'demo', demo: true, region: seed.region, languages: [], agent_providers: [] },
    dataOrigin: 'fixture',
  }
}

/**
 * Live data: REST bootstrap → WebSocket stream (backend) and, when the backend publishes
 * public Supabase settings, Supabase Realtime as an additional source. Falls back to
 * polling, then to the bundled fixture when the API is unreachable.
 */
export function useLiveData() {
  const [state, dispatch] = useReducer(liveReducer, initialLiveState)
  const socketRef = useRef(null)
  const retryRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const [config, nodes, events, alerts, settlements] = await Promise.all([
        apiFetch('/api/config'), apiFetch('/api/nodes'), apiFetch('/api/events?limit=100'), apiFetch('/api/alerts'), apiFetch('/api/settlements'),
      ])
      dispatch({ type: 'bootstrap', payload: { config, nodes, events, alerts, settlements, dataOrigin: 'api' }, at: now() })
      return config
    } catch (error) {
      dispatch({ type: 'error', error: error.message })
      return null
    }
  }, [])

  // Bootstrap + fixture fallback
  useEffect(() => {
    let cancelled = false
    refresh().then((config) => {
      if (!cancelled && !config) {
        dispatch({ type: 'bootstrap', payload: fixtureState(), at: null })
        dispatch({ type: 'connection', connection: 'offline', error: `API unreachable at ${API}` })
      }
    })
    return () => { cancelled = true }
  }, [refresh])

  // WebSocket with capped exponential reconnect and keep-alive ping
  useEffect(() => {
    let closed = false
    let reconnectTimer
    let pingTimer
    const connect = () => {
      let socket
      try { socket = new WebSocket(WS_URL) } catch { schedule(); return }
      socketRef.current = socket
      socket.onopen = () => {
        retryRef.current = 0
        dispatch({ type: 'connection', connection: 'live', error: null })
        refresh()
        pingTimer = setInterval(() => socket.readyState === 1 && socket.send('ping'), 25000)
      }
      socket.onmessage = (message) => {
        let data
        try { data = JSON.parse(message.data) } catch { return }
        const at = now()
        if (data.type === 'snapshot') dispatch({ type: 'snapshot', events: data.events, nodes: data.nodes, alerts: data.alerts, at })
        else if (data.type === 'telemetry') dispatch({ type: 'telemetry', event: data.event, at })
        else if (data.type === 'alert') dispatch({ type: 'alert', alert: data.alert, at })
      }
      socket.onclose = () => { clearInterval(pingTimer); if (!closed) schedule() }
      socket.onerror = () => socket.close()
    }
    const schedule = () => {
      retryRef.current += 1
      dispatch({ type: 'connection', connection: retryRef.current > 2 ? 'polling' : 'connecting' })
      const delay = Math.min(30000, 1000 * 2 ** Math.min(retryRef.current, 5))
      reconnectTimer = setTimeout(connect, delay)
    }
    connect()
    return () => { closed = true; clearTimeout(reconnectTimer); clearInterval(pingTimer); socketRef.current?.close() }
  }, [refresh])

  // Polling fallback while the socket is down
  useEffect(() => {
    if (state.connection === 'live' || state.connection === 'realtime') return undefined
    const timer = setInterval(async () => {
      const config = await refresh()
      if (!config && state.dataOrigin !== 'fixture') dispatch({ type: 'connection', connection: 'offline' })
    }, 10000)
    return () => clearInterval(timer)
  }, [state.connection, state.dataOrigin, refresh])

  // Optional Supabase Realtime (public anon key only; RLS-limited read access)
  const realtime = state.config?.realtime
  useEffect(() => {
    if (!realtime?.url || !realtime?.anon_key) return undefined
    let channel
    let client
    let cancelled = false
    import('@supabase/supabase-js').then(({ createClient }) => {
      if (cancelled) return
      client = createClient(realtime.url, realtime.anon_key, { auth: { persistSession: false } })
      channel = client.channel('bhudrishti-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => dispatch({ type: 'alert', alert: { ...payload.new, demo: payload.new?.is_demo }, at: now() }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, (payload) => dispatch({ type: 'device', device: { ...payload.new, demo: payload.new?.is_demo } }))
        .subscribe()
    }).catch(() => { /* realtime optional */ })
    return () => { cancelled = true; if (channel && client) client.removeChannel(channel) }
  }, [realtime?.url, realtime?.anon_key])

  return { state, refresh, dispatch }
}
