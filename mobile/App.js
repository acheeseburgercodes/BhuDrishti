/**
 * BhuDrishti companion app (Expo SDK 53).
 * Tabs: Home (status + alert feed), Capture (phone seismic sample), Queue (offline outbox),
 * Map (coverage + nodes), Settings (language, server, node).
 */
import React, { useState } from 'react'
import { Platform, SafeAreaView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { AppProvider, useApp } from './src/store'
import { HomeScreen } from './src/screens/HomeScreen'
import { CaptureScreen } from './src/screens/CaptureScreen'
import { QueueScreen } from './src/screens/QueueScreen'
import { MapScreen } from './src/screens/MapScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { C } from './src/theme'

const TABS = [
  { id: 'home', key: 'overview', icon: '◉', Screen: HomeScreen },
  { id: 'capture', key: 'capture', icon: '∿', Screen: CaptureScreen },
  { id: 'queue', key: 'queue', icon: '⇅', Screen: QueueScreen },
  { id: 'map', key: 'map', icon: '▦', Screen: MapScreen },
  { id: 'settings', key: 'settings', icon: '⚙', Screen: SettingsScreen },
]

function Shell() {
  const { t, queueStatus, data, loaded } = useApp()
  const [tab, setTab] = useState('home')
  const current = TABS.find((x) => x.id === tab)
  const pendingAlerts = data.alerts.filter((a) => a.status === 'pending_approval' || a.status === 'approved').length
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Text accessibilityRole="header" style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>{t('appName')}</Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>{t('tagline')}</Text>
      </View>
      <View style={{ flex: 1 }}>{loaded ? <current.Screen /> : <Text style={{ color: C.muted, padding: 16 }}>Loading…</Text>}</View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface }}>
        {TABS.map((x) => {
          const active = x.id === tab
          const badge = x.id === 'queue' ? queueStatus.pending : x.id === 'home' ? pendingAlerts : 0
          return (
            <TouchableOpacity key={x.id} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${t(x.key)}${badge ? `, ${badge}` : ''}`}
              onPress={() => setTab(x.id)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, minHeight: 56, justifyContent: 'center' }}>
              <Text style={{ color: active ? C.accent : C.muted, fontSize: 18 }}>{x.icon}{badge ? <Text style={{ color: C.advisory, fontSize: 12 }}> {badge}</Text> : null}</Text>
              <Text style={{ color: active ? C.ink : C.muted, fontSize: 11, fontWeight: active ? '700' : '500' }}>{t(x.key)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </SafeAreaView>
  )
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>
}
