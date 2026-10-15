/**
 * BhuDrishti companion app (Expo SDK 53).
 * Tabs: Home (status + alert feed), Capture (phone seismic sample), Queue (offline outbox),
 * Map (coverage + nodes), Settings (language, server, node).
 */
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Platform, Pressable, SafeAreaView, StatusBar, Text, useWindowDimensions, View } from 'react-native'
import { AppProvider, useApp } from './src/store'
import { HomeScreen } from './src/screens/HomeScreen'
import { CaptureScreen } from './src/screens/CaptureScreen'
import { QueueScreen } from './src/screens/QueueScreen'
import { MapScreen } from './src/screens/MapScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { C } from './src/theme'

const TABS = [
  { id: 'home', key: 'overview', icon: '⌾', Screen: HomeScreen },
  { id: 'capture', key: 'capture', icon: '∿', Screen: CaptureScreen },
  { id: 'queue', key: 'queue', icon: '⇅', Screen: QueueScreen },
  { id: 'map', key: 'map', icon: '◇', Screen: MapScreen },
  { id: 'settings', key: 'settings', icon: '⚙', Screen: SettingsScreen },
]

function Shell() {
  const { t, queueStatus, data, loaded, net, server } = useApp()
  const [tab, setTab] = useState('home')
  const transition = useRef(new Animated.Value(1)).current
  const { width } = useWindowDimensions()
  const tablet = width >= 760
  const current = TABS.find((x) => x.id === tab)
  const pendingAlerts = data.alerts.filter((a) => a.status === 'pending_approval' || a.status === 'approved').length
  useEffect(() => {
    transition.setValue(0)
    Animated.spring(transition, { toValue: 1, damping: 20, stiffness: 210, mass: 0.8, useNativeDriver: true }).start()
  }, [tab, transition])
  const screenMotion = {
    opacity: transition,
    transform: [
      { translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: transition.interpolate({ inputRange: [0, 1], outputRange: [0.992, 1] }) },
    ],
  }
  const connected = net.connected !== false && server.reachable !== false

  const navigation = (
    <View accessibilityRole="tablist" style={tablet ? styles.rail : styles.dock}>
      {TABS.map((x) => {
        const active = x.id === tab
        const badge = x.id === 'queue' ? queueStatus.pending : x.id === 'home' ? pendingAlerts : 0
        return (
          <Pressable key={x.id} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${t(x.key)}${badge ? `, ${badge}` : ''}`}
            onPress={() => setTab(x.id)} style={({ pressed }) => [styles.tab, tablet && styles.railTab, active && styles.activeTab, pressed && styles.pressedTab]}>
            {active && <View style={[styles.activeMarker, tablet && styles.railMarker]} />}
            <View>
              <Text style={[styles.tabIcon, active && styles.activeTabText]}>{x.icon}</Text>
              {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
            </View>
            <Text numberOfLines={1} style={[styles.tabLabel, tablet && styles.railLabel, active && styles.activeTabText]}>{t(x.key)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <View style={styles.brandMark}><View style={styles.ridge} /><View style={styles.river} /></View>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={styles.brand}>{t('appName')}</Text>
          <Text numberOfLines={1} style={styles.tagline}>{t('tagline')}</Text>
        </View>
        <View accessibilityLabel={connected ? 'Network connected' : 'Network disconnected'} style={[styles.liveDot, { backgroundColor: connected ? C.ok : C.danger }]} />
      </View>
      <View style={[styles.workspace, tablet && styles.tabletWorkspace]}>
        {tablet && navigation}
        <View style={styles.content}>
          {loaded
            ? <Animated.View key={tab} style={[styles.content, screenMotion]}><current.Screen /></Animated.View>
            : <View style={styles.loading}><ActivityIndicator color={C.accent} /><Text style={styles.loadingText}>Preparing the corridor…</Text></View>}
        </View>
      </View>
      {!tablet && navigation}
    </SafeAreaView>
  )
}

const styles = {
  header: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bg },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  ridge: { position: 'absolute', left: 7, right: 7, top: 12, height: 13, borderTopWidth: 2, borderColor: C.ink, transform: [{ rotate: '-13deg' }] },
  river: { position: 'absolute', left: 7, right: 7, bottom: 8, height: 4, borderRadius: 8, backgroundColor: C.accent },
  brand: { color: C.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  tagline: { color: C.muted, fontSize: 11, marginTop: 1 },
  liveDot: { width: 9, height: 9, borderRadius: 9, shadowColor: C.ok, shadowOpacity: 0.8, shadowRadius: 7, elevation: 4 },
  workspace: { flex: 1 },
  tabletWorkspace: { flexDirection: 'row', padding: 12, gap: 12 },
  content: { flex: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: C.muted, fontSize: 13 },
  dock: { position: 'absolute', left: 10, right: 10, bottom: Math.max(10, Platform.OS === 'ios' ? 20 : 10), height: 66, padding: 5, borderRadius: 23, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.glass, flexDirection: 'row', shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 18 },
  rail: { width: 132, padding: 7, borderRadius: 23, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.glass, gap: 3 },
  tab: { flex: 1, minWidth: 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 2 },
  railTab: { flex: 0, minHeight: 58, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'flex-start', gap: 10 },
  activeTab: { backgroundColor: C.accentSoft },
  pressedTab: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  activeMarker: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 4, backgroundColor: C.accent },
  railMarker: { left: 3, bottom: 'auto', width: 3, height: 20 },
  tabIcon: { color: C.muted, fontSize: 19, lineHeight: 22, textAlign: 'center' },
  tabLabel: { color: C.muted, fontSize: 10, fontWeight: '600', maxWidth: 66 },
  railLabel: { fontSize: 12, fontWeight: '700' },
  activeTabText: { color: C.accent },
  badge: { position: 'absolute', right: -9, top: -4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: C.advisory, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.glass },
  badgeText: { color: '#201604', fontSize: 9, fontWeight: '900' },
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>
}
