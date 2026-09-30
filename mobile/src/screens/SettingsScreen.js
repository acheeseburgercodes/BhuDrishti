import React, { useEffect, useState } from 'react'
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useApp } from '../store'
import { LANGUAGES } from '../shared'
import { getJson } from '../sender'
import { Card } from '../components'
import { C, s } from '../theme'

export function SettingsScreen() {
  const { settings, updateSettings, refresh, t } = useApp()
  const [apiUrl, setApiUrl] = useState(settings.apiUrl)
  const [nodeId, setNodeId] = useState(settings.nodeId)
  const [status, setStatus] = useState('')
  useEffect(() => { setApiUrl(settings.apiUrl); setNodeId(settings.nodeId) }, [settings.apiUrl, settings.nodeId])

  const save = async () => {
    setStatus('Checking…')
    try {
      const health = await getJson(apiUrl, '/api/health', fetch, 5000)
      await updateSettings({ apiUrl: apiUrl.trim(), nodeId: nodeId.trim().toUpperCase() })
      setStatus(`${t('connected')}: ${health.nodes} nodes, mode ${health.mode}.`)
      refresh()
    } catch (error) {
      await updateSettings({ apiUrl: apiUrl.trim(), nodeId: nodeId.trim().toUpperCase() })
      setStatus(`Saved, but the server did not answer (${error.message}). Readings will queue until it does.`)
    }
  }

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
        <TextInput accessibilityLabelledBy="nodeLabel" style={s.input} value={nodeId} onChangeText={setNodeId} autoCapitalize="characters" autoCorrect={false} placeholder="BD-001" placeholderTextColor={C.muted} />
        <TouchableOpacity accessibilityRole="button" onPress={save} style={s.btn}><Text style={s.btnText}>Save and test</Text></TouchableOpacity>
        {status ? <Text style={[s.body, { marginTop: 8 }]} accessibilityLiveRegion="polite">{status}</Text> : null}
        <Text style={[s.muted, { marginTop: 10 }]}>Device id: {settings.deviceId}. It is random, stored only on this phone, and identifies which phone sent a reading. No account, contacts or location are collected.</Text>
      </Card>
    </ScrollView>
  )
}
