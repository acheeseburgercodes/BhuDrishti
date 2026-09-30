import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { OfflineQueue, makeT } from './shared'
import { getJson, makeSender, normaliseBaseUrl } from './sender'

const DEFAULTS = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.10:8000',
  nodeId: 'BD-001',
  deviceId: '',
  lang: 'en',
  autoSend: false,
}
const SETTINGS_KEY = '@bhudrishti/settings.v2'
const CACHE_KEY = '@bhudrishti/cache.v1'

export const queue = new OfflineQueue(AsyncStorage, { key: '@bhudrishti/outbox.v1' })
const AppContext = createContext(null)

function randomDeviceId() {
  return `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [net, setNet] = useState({ connected: null, type: 'unknown' })
  const [queueStatus, setQueueStatus] = useState(queue.status())
  const [server, setServer] = useState({ reachable: null, mode: null, lastSync: null, error: null })
  const [data, setData] = useState({ alerts: [], nodes: [], events: [], settlements: [], cached: false })
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Load persisted settings (migrating the v1 keys used by the previous app).
  useEffect(() => {
    (async () => {
      let next = { ...DEFAULTS }
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY)
        if (raw) next = { ...next, ...JSON.parse(raw) }
        else {
          const legacy = Object.fromEntries((await AsyncStorage.multiGet(['@url', '@node'])).filter(([, v]) => v != null))
          if (legacy['@url']) next.apiUrl = legacy['@url']
          if (legacy['@node']) next.nodeId = legacy['@node']
        }
        const cache = await AsyncStorage.getItem(CACHE_KEY)
        if (cache) setData({ ...JSON.parse(cache), cached: true })
      } catch { /* corrupt storage: fall back to defaults */ }
      if (!next.deviceId) next.deviceId = randomDeviceId()
      setSettings(next)
      setLoaded(true)
    })()
    const offQueue = queue.subscribe(setQueueStatus)
    queue.load()
    const offNet = NetInfo.addEventListener((s) => setNet({ connected: s.isConnected, type: s.type }))
    return () => { offQueue(); offNet() }
  }, [])

  const updateSettings = useCallback(async (patch) => {
    const next = { ...settingsRef.current, ...patch }
    setSettings(next)
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }, [])

  const sender = useCallback((payload) => makeSender({ baseUrl: settingsRef.current.apiUrl })(payload), [])

  const flush = useCallback(async (force = false) => {
    try { return await queue.flush(sender, { force }) } catch { return null }
  }, [sender])

  const refresh = useCallback(async () => {
    const { apiUrl } = settingsRef.current
    try {
      normaliseBaseUrl(apiUrl)
      const [health, alerts, nodes, events, settlements] = await Promise.all([
        getJson(apiUrl, '/api/health'), getJson(apiUrl, '/api/alerts'), getJson(apiUrl, '/api/nodes'), getJson(apiUrl, '/api/events?limit=30'), getJson(apiUrl, '/api/settlements'),
      ])
      const next = { alerts, nodes, events, settlements }
      setData({ ...next, cached: false })
      setServer({ reachable: true, mode: health.mode, lastSync: new Date().toISOString(), error: null })
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...next, events: events.slice(0, 10).map(({ telemetry, ...e }) => e) })).catch(() => {})
    } catch (error) {
      setServer((s) => ({ ...s, reachable: false, error: error.message }))
      setData((d) => ({ ...d, cached: d.alerts.length > 0 || d.nodes.length > 0 }))
    }
  }, [])

  // Periodic sync + flush; also flush as soon as connectivity returns.
  useEffect(() => {
    if (!loaded) return undefined
    refresh()
    const timer = setInterval(() => { refresh(); flush() }, 15000)
    return () => clearInterval(timer)
  }, [loaded, refresh, flush])
  useEffect(() => { if (net.connected) flush() }, [net.connected, flush])

  const value = useMemo(() => ({
    settings, updateSettings, loaded, net, server, data, queueStatus, flush, refresh, sender, t: makeT(settings.lang),
  }), [settings, updateSettings, loaded, net, server, data, queueStatus, flush, refresh, sender])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => useContext(AppContext)
