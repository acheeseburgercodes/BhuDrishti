import React, { useEffect, useState } from 'react'
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useApp } from '../store'
import { LANGUAGES } from '../shared'
import { getJson } from '../sender'
import { ensureNotifications } from '../notify'
import { Card } from '../components'
import { C, s } from '../theme'

export function SettingsScreen() {
  const { settings, updateSettings, refresh, data, t } = useApp()
  const [apiUrl, setApiUrl] = useState(settings.apiUrl)
  const [nodeId, setNodeId] = useState(settings.nodeId)
  const [deviceKey, setDeviceKey] = useState(settings.deviceKey || '')
  const [status, setStatus] = useState('')
  const [notifyStatus, setNotifyStatus] = useState('')
  useEffect(() => { setApiUrl(settings.apiUrl); setNodeId(settings.nodeId); setDeviceKey(settings.deviceKey || '') }, [settings.apiUrl, settings.nodeId, settings.deviceKey])

  const save = async () => {
    const patch = { apiUrl: apiUrl.trim(), nodeId: nodeId.trim().toUpperCase(), deviceKey: deviceKey.trim() }
    setStatus('Checking…')
    try {
      const health = await getJson(apiUrl, '/api/health', fetch, 5000)
      await updateSettings(patch)
      const known = data.nodes.length === 0 || data.nodes.some((n) => n.id === patch.nodeId)
      setStatus(`${t('connected')}: ${health.nodes} nodes, mode ${health.mode}.${known ? '' : ` Warning: node ${patch.nodeId} is not registered on this server.`}`)
      refresh()
    } catch (error) {
      await updateSettings(patch)
      setStatus(`Saved, but the server did not answer (${error.message}). Readings will queue until it does.`)
    }
  }

  const toggleNotify = async (on) => {
    await updateSettings({ notify: on })
    if (on) setNotifyStatus((await ensureNotifications()) ? 'Alert notifications are on.' : 'Notifications are blocked. Allow them for BhuDrishti in Android settings.')
    else setNotifyStatus('')
  }

  const pickable = data.nodes.filter((n) => /^BD-\d+/.test(n.id)).slice(0, 12)
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <Card eyebrow={t('language')} title={t('language')}>
        <View style={s.row} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => (
            <TouchableOpacity key={l.code} accessibilityRole="radio" accessibilityState={{ checked: settings.lang === l.code }} accessibilityLabel={l.label}
              onPress={() => updateSettings({ lang: l.code })} style={[s.btnSecondary, settings.lang === l.code && { borderColor: C.accent, backgroundColor: '#12302b' }]}>
              <Text style={s.btnSecondaryText}>{l.nativeLabel}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[s.muted, { marginTop: 8 }]}>Interface text is bundled in the app. Nepali and Hindi wording still needs native-speaker review.</Text>
      </Card>
      <Card eyebrow="Connection" title={t('settings')}>
        <Text style={s.muted} nativeID="apiLabel">Backend URL (same Wi-Fi as the laptop, e.g. http://192.168.1.10:8000)</Text>
        <TextInput accessibilityLabelledBy="apiLabel" style={s.input} value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.10:8000" placeholderTextColor={C.muted} />
        <Text style={s.muted} nativeID="nodeLabel">Node this phone reports for</Text>
        {pickable.length > 0 && (
          <View style={[s.row, { marginVertical: 6 }]} accessibilityRole="radiogroup">
            {pickable.map((n) => (
              <TouchableOpacity key={n.id} accessibilityRole="radio" accessibilityState={{ checked: nodeId === n.id }} accessibilityLabel={`${n.id} ${n.name || ''}`}
                onPress={() => setNodeId(n.id)} style={[s.btnSecondary, nodeId === n.id && { borderColor: C.accent, backgroundColor: '#12302b' }]}>
                <Text style={s.btnSecondaryText}>{n.id}</Text>
                {n.name ? <Text style={[s.muted, { fontSize: 10 }]} numberOfLines={1}>{n.name}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput accessibilityLabelledBy="nodeLabel" style={s.input} value={nodeId} onChangeText={setNodeId} autoCapitalize="characters" autoCorrect={false} placeholder="BD-001" placeholderTextColor={C.muted} />
        <Text style={s.muted} nativeID="keyLabel">Device key (only if the server sets BHUDRISHTI_DEVICE_KEY)</Text>
        <TextInput accessibilityLabelledBy="keyLabel" style={s.input} value={deviceKey} onChangeText={setDeviceKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="optional" placeholderTextColor={C.muted} />
        <TouchableOpacity accessibilityRole="button" onPress={save} style={s.btn}><Text style={s.btnText}>Save and test</Text></TouchableOpacity>
        {status ? <Text style={[s.body, { marginTop: 8 }]} accessibilityLiveRegion="polite">{status}</Text> : null}
        <Text style={[s.muted, { marginTop: 10 }]}>Device id: {settings.deviceId}. It is random, stored only on this phone, and identifies which phone sent a reading. No account, contacts or location are collected.</Text>
      </Card>
      <Card eyebrow="Notifications" title={t('alerts')}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={[s.body, { flex: 1 }]}>Notify me about new and approved alerts</Text>
          <Switch accessibilityLabel="Alert notifications" value={settings.notify !== false} onValueChange={toggleNotify} trackColor={{ true: C.accent, false: C.line }} />
        </View>
        <Text style={[s.muted, { marginTop: 6 }]}>Checked every 15 s while the app is open. This is not a replacement for official NDRRMA / DHM warnings.</Text>
        {notifyStatus ? <Text style={[s.body, { marginTop: 6 }]} accessibilityLiveRegion="polite">{notifyStatus}</Text> : null}
      </Card>
    </ScrollView>
  )
}
