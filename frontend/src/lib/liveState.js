/** Pure reducer for live dashboard state (unit-tested in liveState.test.js). */
export const initialLiveState = {
  config: null,
  nodes: [],
  events: [],
  alerts: [],
  settlements: [],
  connection: 'connecting', // connecting | live | realtime | polling | offline
  dataOrigin: 'none', // api | fixture | none
  lastSyncAt: null,
  error: null,
}

const MAX_EVENTS = 150

function upsertById(list, item, limit = Infinity) {
  if (!item?.id) return list
  const index = list.findIndex((x) => x.id === item.id)
  const next = index === -1 ? [item, ...list] : list.map((x, i) => (i === index ? { ...x, ...item } : x))
  return next.slice(0, limit)
}

function applyEventToNodes(nodes, event) {
  const status = event.classification?.classification === 'event' ? 'critical' : 'online'
  const index = nodes.findIndex((n) => n.id === event.node_id)
  const patch = { last_seen: event.recorded_at, status, battery_pct: event.telemetry?.battery_pct ?? undefined }
  // Queued/replayed readings can arrive late: never move last_seen/status backwards in time.
  if (index !== -1 && nodes[index].last_seen && Date.parse(nodes[index].last_seen) > Date.parse(event.recorded_at)) return nodes
  if (index === -1) {
    return [...nodes, { id: event.node_id, name: event.node_name || event.node_id, lat: event.lat, lng: event.lng, source: event.source, kind: event.source === 'phone_layer' ? 'phone' : 'esp32', demo: event.demo, ...patch }]
  }
  return nodes.map((n, i) => (i === index ? { ...n, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } : n))
}

export function liveReducer(state, action) {
  switch (action.type) {
    case 'bootstrap':
      return { ...state, ...action.payload, lastSyncAt: action.at, error: null }
    case 'snapshot':
      return {
        ...state,
        events: action.events ?? state.events,
        nodes: action.nodes?.length ? action.nodes : state.nodes,
        alerts: action.alerts ?? state.alerts,
        lastSyncAt: action.at,
        dataOrigin: 'api',
      }
    case 'telemetry': {
      const event = action.event
      if (!event?.id) return state
      const events = [event, ...state.events.filter((e) => e.id !== event.id)]
        .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))
        .slice(0, MAX_EVENTS)
      return { ...state, events, nodes: applyEventToNodes(state.nodes, event), lastSyncAt: action.at }
    }
    case 'alert':
      return { ...state, alerts: upsertById(state.alerts, action.alert, 200), lastSyncAt: action.at }
    case 'device':
      return { ...state, nodes: upsertById(state.nodes, action.device) }
    case 'connection':
      return { ...state, connection: action.connection, error: action.error ?? state.error }
    case 'error':
      return { ...state, error: action.error }
    default:
      return state
  }
}

/** The dashboard is "demo" whenever the backend says so or data came from a fixture. */
export function isDemo(state) {
  return state.dataOrigin === 'fixture' || state.config?.mode !== 'live'
}
