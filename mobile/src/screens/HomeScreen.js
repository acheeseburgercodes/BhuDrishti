import React from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { useApp } from '../store'
import { describeSource, formatAge } from '../shared'
import { Badge, Card } from '../components'
import { C, s } from '../theme'

const LEVEL = { advisory: 'advisory', watch: 'watch', warning: 'danger' }

export function HomeScreen() {
  const { data, server, net, queueStatus, refresh, t } = useApp()
  const [refreshing, setRefreshing] = React.useState(false)
  const now = Date.now()
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false) }
  const active = data.alerts.filter((a) => a.status === 'pending_approval' || a.status === 'approved')
  return (
    <ScrollView contentContainerStyle={s.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
      <Card eyebrow="Status">
        <View style={s.row} accessibilityLiveRegion="polite">
          <Badge tone={net.connected === false ? 'danger' : 'ok'}>{net.connected === false ? t('offline') : `Network: ${net.type}`}</Badge>
          <Badge tone={server.reachable ? 'ok' : server.reachable === false ? 'danger' : 'neutral'}>{server.reachable ? `Server ${server.mode === 'live' ? t('liveData') : t('demoData')}` : server.reachable === false ? 'Server unreachable' : 'Checking server…'}</Badge>
          {queueStatus.pending > 0 && <Badge tone="advisory">{queueStatus.pending} {t('pendingSync')}</Badge>}
          {data.cached && <Badge tone="neutral">Showing cached data</Badge>}
        </View>
        <Text style={[s.muted, { marginTop: 8 }]}>Last sync: {server.lastSync ? formatAge(server.lastSync, now) : 'never'}{server.error ? ` · ${server.error}` : ''}</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>{t('disclaimer')}</Text>
      </Card>

      <Card eyebrow={t('alerts')} title={active.length ? `${active.length}` : t('noAlerts')}>
        {active.slice(0, 10).map((a) => (
          <View key={a.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }} accessible accessibilityLabel={`${a.level} alert at ${a.node_name}, ${a.status === 'approved' ? 'approved by operator' : 'awaiting operator approval'}`}>
            <View style={s.row}>
              <Badge tone={LEVEL[a.level] || 'advisory'}>{a.level}</Badge>
              <Text style={[s.body, { fontWeight: '700' }]}>{a.node_name}</Text>
              {a.demo && <Badge tone="demo">{t('demoData')}</Badge>}
            </View>
            <Text style={[s.body, { marginTop: 6 }]}>{t(a.level === 'watch' ? 'alertWatch' : 'alertAdvisory', { place: a.node_name })}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{a.status === 'approved' ? 'Approved by operator' : t('pendingApproval')} · {formatAge(a.updated_at, now)} · {Math.round((a.confidence || 0) * 100)}% {t('confidence').toLowerCase()}</Text>
          </View>
        ))}
      </Card>

      <Card eyebrow={t('events')}>
        {data.events.length === 0 ? <Text style={s.muted}>{t('noEvents')}</Text> : data.events.slice(0, 8).map((e) => (
          <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 8 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.body}>{e.node_name}</Text>
              <Text style={s.muted}>{formatAge(e.recorded_at, now)}</Text>
            </View>
            <View style={[s.row, { marginTop: 4 }]}>
              <Badge tone={e.classification?.classification === 'event' ? 'watch' : 'ok'}>{e.classification?.classification || '?'}</Badge>
              <Text style={s.muted}>{describeSource(e)}</Text>
              {e.cross_confirmation?.cross_confirmed && <Badge tone="watch">{t('crossConfirmed')}</Badge>}
              {e.demo && <Badge tone="demo">demo</Badge>}
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  )
}
