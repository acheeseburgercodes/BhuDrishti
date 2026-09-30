/**
 * Local (on-device) alert notifications. No push server or Firebase is involved: the app
 * already polls /api/alerts every 15 s, and this raises a notification the first time it
 * sees a new or newly approved alert. Seen ids are persisted so a restart does not re-notify.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const SEEN_KEY = '@bhudrishti/notified-alerts.v1'
const MAX_SEEN = 300
let Notifications = null
let ready = null

async function init() {
  try {
    Notifications = require('expo-notifications')
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    })
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Flood / debris-flow alerts', importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400], lightColor: '#2dd4bf', sound: 'default',
      })
    }
    const current = await Notifications.getPermissionsAsync()
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted
    return granted
  } catch {
    Notifications = null
    return false
  }
}

export function ensureNotifications() {
  if (!ready) ready = init()
  return ready
}

/** Key changes when an alert is created or approved, so each transition notifies once. */
export const alertKey = (a) => `${a.id}:${a.status}`

export async function notifyNewAlerts(alerts, t) {
  const relevant = (alerts || []).filter((a) => a.status === 'pending_approval' || a.status === 'approved')
  if (!relevant.length) return 0
  let seen = []
  try { seen = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || '[]') } catch { seen = [] }
  const seenSet = new Set(seen)
  const fresh = relevant.filter((a) => !seenSet.has(alertKey(a)))
  if (!fresh.length) return 0
  const next = [...seen, ...fresh.map(alertKey)].slice(-MAX_SEEN)
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => {})
  if (!(await ensureNotifications()) || !Notifications) return 0
  for (const a of fresh.slice(0, 3)) {
    const approved = a.status === 'approved'
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${approved ? '⚠ ' : ''}${String(a.level || 'advisory').toUpperCase()} · ${a.node_name}`,
        body: `${t(a.level === 'watch' ? 'alertWatch' : 'alertAdvisory', { place: a.node_name })} ${approved ? '' : `(${t('pendingApproval')})`}`.trim(),
        data: { alertId: a.id },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'alerts' } : null,
    }).catch(() => {})
  }
  return fresh.length
}
