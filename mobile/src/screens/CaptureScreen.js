import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native'
import { Accelerometer } from 'expo-sensors'
import { useApp, queue } from '../store'
import { makeClientEventId, validateTelemetry } from '../shared'
import { Badge, Card, KV, Waveform } from '../components'
import { C, s } from '../theme'

const SAMPLE_TARGET = 160
const SAMPLE_INTERVAL_MS = 10 // requested 100 Hz; devices may deliver less
const CAPTURE_DEADLINE_MS = 2500
const AUTO_EVERY_MS = 10000

export function CaptureScreen() {
  const { settings, updateSettings, sender, t, net } = useApp()
  const [sensor, setSensor] = useState('checking') // checking | ready | unavailable | denied
  const [phase, setPhase] = useState('idle') // idle | capturing | sending
  const [samples, setSamples] = useState([])
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const buffer = useRef([])
  const capturing = useRef(false)
  const startedAt = useRef(0)
  const deadline = useRef(null)

  useEffect(() => {
    let sub
    let cancelled = false
    ;(async () => {
      try {
        const available = await Accelerometer.isAvailableAsync()
        if (!available) { if (!cancelled) setSensor('unavailable'); return }
        const permission = await Accelerometer.requestPermissionsAsync?.()
        if (permission && permission.status !== 'granted') { if (!cancelled) setSensor('denied'); return }
        Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS)
        sub = Accelerometer.addListener(({ x, y, z }) => {
          if (!capturing.current) return
          buffer.current.push(Math.sqrt(x * x + y * y + z * z) - 1.0) // g, gravity removed
          if (buffer.current.length % 16 === 0) setSamples([...buffer.current])
          if (buffer.current.length >= SAMPLE_TARGET) finishRef.current()
        })
        if (!cancelled) setSensor('ready')
      } catch {
        if (!cancelled) setSensor('unavailable')
      }
    })()
    return () => { cancelled = true; sub?.remove(); clearTimeout(deadline.current) }
  }, [])

  const submit = useCallback(async (window, rateHz) => {
    const payload = {
      node_id: settings.nodeId, device_id: settings.deviceId, sensor_window: window, source: 'phone_layer', channel: 'mobile_app',
      transport: net.type === 'cellular' ? 'cellular' : 'http', client_event_id: makeClientEventId('m'), captured_at: new Date().toISOString(),
      sample_rate_hz: Math.max(10, Math.min(1000, Math.round(rateHz))), app_version: '2.0.0',
    }
    const check = validateTelemetry(payload)
    if (!check.ok) { setMessage(check.errors.join('; ')); setPhase('idle'); return }
    setPhase('sending')
    try {
      const event = await sender(payload)
      setResult(event)
      setMessage('')
    } catch (error) {
      if (error.permanent) setMessage(`Server rejected the reading: ${error.message}`)
      else {
        await queue.enqueue(payload)
        setMessage(`${t('queued')}: ${error.message}. It will be retried automatically.`)
      }
    } finally {
      setPhase('idle')
    }
  }, [settings.nodeId, settings.deviceId, sender, net.type, t])

  const finish = useCallback(() => {
    if (!capturing.current) return
    capturing.current = false
    clearTimeout(deadline.current)
    const data = buffer.current.slice(0, SAMPLE_TARGET)
    setSamples(data)
    const seconds = (Date.now() - startedAt.current) / 1000
    if (data.length < 8) { setPhase('idle'); setMessage(`Only ${data.length} samples arrived; the sensor may be throttled.`); return }
    submit(data, data.length / Math.max(seconds, 0.1))
  }, [submit])
  const finishRef = useRef(finish)
  finishRef.current = finish

  const start = useCallback(() => {
    if (capturing.current || sensor !== 'ready' || !settings.nodeId) return
    buffer.current = []
    setSamples([])
    setResult(null)
    setMessage('')
    capturing.current = true
    startedAt.current = Date.now()
    setPhase('capturing')
    deadline.current = setTimeout(() => finishRef.current(), CAPTURE_DEADLINE_MS)
  }, [sensor, settings.nodeId])

  // Auto mode pauses when the app is backgrounded.
  useEffect(() => {
    if (!settings.autoSend) return undefined
    let appActive = AppState.currentState === 'active'
    const sub = AppState.addEventListener('change', (st) => { appActive = st === 'active' })
    const timer = setInterval(() => { if (appActive && phase === 'idle') start() }, AUTO_EVERY_MS)
    return () => { clearInterval(timer); sub.remove() }
  }, [settings.autoSend, phase, start])

  const busy = phase !== 'idle'
  const isEvent = result?.classification?.classification === 'event'
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Card eyebrow="Phone seismic layer" title={t('capture')}>
        {sensor === 'unavailable' && <Text style={[s.body, { color: C.danger }]} accessibilityRole="alert">{t('sensorUnavailable')}</Text>}
        {sensor === 'denied' && <Text style={[s.body, { color: C.danger }]} accessibilityRole="alert">{t('permissionDenied')} Enable motion access in system settings.</Text>}
        <Text style={[s.muted, { marginBottom: 8 }]}>Node {settings.nodeId} · device {settings.deviceId}. Place the phone flat on a solid surface near the river for best results.</Text>
        <Waveform samples={samples} />
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || sensor !== 'ready', busy }} disabled={busy || sensor !== 'ready'} onPress={start} style={[s.btn, { marginTop: 12 }, (busy || sensor !== 'ready') && s.disabled]}>
          <Text style={s.btnText}>{phase === 'capturing' ? t('capturing') : phase === 'sending' ? t('sending') : t('captureStart')}</Text>
        </TouchableOpacity>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 14 }]}>
          <Text style={s.body}>Auto-record every 10 s</Text>
          <Switch accessibilityLabel="Auto-record every 10 seconds" value={settings.autoSend} onValueChange={(v) => updateSettings({ autoSend: v })} trackColor={{ true: C.accent, false: C.line }} />
        </View>
        {settings.autoSend && <Text style={[s.muted, { color: C.advisory }]}>Uses battery and data. Pauses when the app is in the background.</Text>}
        {message ? <Text style={[s.body, { marginTop: 10 }]} accessibilityLiveRegion="polite">{message}</Text> : null}
      </Card>
      {result && (
        <Card eyebrow="Server decision" style={{ borderColor: isEvent ? C.watch : C.ok }}>
          <View style={s.row}>
            <Badge tone={isEvent ? 'watch' : 'ok'}>{isEvent ? 'Vibration event' : 'Normal'}</Badge>
            <Badge tone={result.cross_confirmation?.cross_confirmed ? 'watch' : 'neutral'}>{result.cross_confirmation?.cross_confirmed ? t('crossConfirmed') : t('singleSource')}</Badge>
            {result.demo && <Badge tone="demo">demo</Badge>}
          </View>
          <KV k="Model confidence" v={`${Math.round(result.classification.confidence * 100)}%`} />
          {isEvent && <KV k="Alert confidence" v={`${Math.round((result.alert_confidence || 0) * 100)}%`} />}
          <KV k="Signal quality" v={`${Math.round((result.quality?.score ?? 1) * 100)}%${result.quality?.flags?.length ? ` (${result.quality.flags.join(', ')})` : ''}`} />
          <KV k="Peak / dominant freq." v={`${result.classification.features.peak_amplitude?.toFixed(3)} g / ${result.classification.features.dominant_frequency_hz?.toFixed(1)} Hz`} />
          <KV k="Stored" v={result.persistence || '—'} />
        </Card>
      )}
    </ScrollView>
  )
}
