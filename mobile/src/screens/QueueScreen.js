import React from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { queue, useApp } from '../store'
import { formatAge } from '../shared'
import { Badge, Card } from '../components'
import { C, s } from '../theme'

export function QueueScreen() {
  const { queueStatus, flush, net, t } = useApp()
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const now = Date.now()
  const sync = async () => { setBusy(true); setResult(await flush(true)); setBusy(false) }
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Card eyebrow="Offline outbox" title={`${queueStatus.pending} ${t('pendingSync')}`}>
        <View style={s.row} accessibilityLiveRegion="polite">
          <Badge tone={net.connected === false ? 'danger' : 'ok'}>{net.connected === false ? t('offline') : t('connected')}</Badge>
          {queueStatus.flushing && <Badge tone="accent">Syncing…</Badge>}
          {queueStatus.failed > 0 && <Badge tone="danger">{queueStatus.failed} failed</Badge>}
        </View>
        <Text style={[s.muted, { marginTop: 8 }]}>Readings recorded without a connection are stored on this phone and retried with increasing delays (2 s up to 5 min). Each keeps its original capture time and a unique id, so a retry never creates a duplicate on the server.</Text>
        {queueStatus.nextAttemptAt && <Text style={[s.muted, { marginTop: 6 }]}>Next automatic retry {queueStatus.nextAttemptAt > now ? `in ${Math.ceil((queueStatus.nextAttemptAt - now) / 1000)} s` : 'now'}.</Text>}
        {queueStatus.lastError && <Text style={[s.muted, { marginTop: 6, color: C.advisory }]}>Last error: {queueStatus.lastError}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={busy || !queueStatus.pending} onPress={sync} style={[s.btn, { marginTop: 12 }, (busy || !queueStatus.pending) && s.disabled]}>
          <Text style={s.btnText}>{busy ? 'Syncing…' : t('syncNow')}</Text>
        </TouchableOpacity>
        {result && <Text style={[s.body, { marginTop: 8 }]}>Sent {result.sent}, retry later {result.retried}, dropped {result.dropped}.</Text>}
      </Card>
      <Card eyebrow="Items">
        {queue.items.length === 0 ? <Text style={s.muted}>Nothing waiting.</Text> : queue.items.map((item) => (
          <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 8 }}>
            <Text style={s.body}>{item.payload.node_id} · {item.payload.sensor_window?.length} samples</Text>
            <Text style={s.muted}>captured {formatAge(item.payload.captured_at || item.payload.queued_at, now)} · attempts {item.attempts}{item.lastError ? ` · ${item.lastError}` : ''}</Text>
          </View>
        ))}
        {queue.failed.length > 0 && (
          <TouchableOpacity accessibilityRole="button" onPress={() => queue.clearFailed()} style={[s.btnSecondary, { marginTop: 10 }]}>
            <Text style={s.btnSecondaryText}>Clear {queue.failed.length} failed item(s)</Text>
          </TouchableOpacity>
        )}
      </Card>
    </ScrollView>
  )
}
