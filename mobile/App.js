/**
 * BhuDrishti Mobile — Accelerometer → WiFi → /api/ingest
 * Expo SDK 52 · expo-sensors · direct WiFi POST
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, StatusBar, Switch, Dimensions,
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Config ────────────────────────────────────────────────────────────────────
const SAMPLE_TARGET  = 160;
const SAMPLE_RATE_MS = 10;   // 100 Hz
const CAPTURE_MS     = 2500; // hard deadline
const AUTO_EVERY_MS  = 5000;

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0b1120', surface: '#131c2e', border: '#1e3050',
  accent: '#1d8cf8', warn: '#f4a623', danger: '#e74c3c',
  ok: '#2ecc71', text: '#e0e8f5', muted: '#6b82a0',
};

// ── Waveform ──────────────────────────────────────────────────────────────────
function Waveform({ samples }) {
  const W = Dimensions.get('window').width - 64;
  const H = 72;
  if (!samples || samples.length < 2) {
    return <View style={{ width: W, height: H, backgroundColor: C.bg, borderRadius: 8, marginBottom: 10 }} />;
  }
  const maxAmp = Math.max(1, ...samples.map(Math.abs));
  const step = W / (samples.length - 1);
  return (
    <View style={{ width: W, height: H, backgroundColor: C.bg, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: H / 2, left: 0, right: 0, height: 1, backgroundColor: C.border }} />
      {samples.map((v, i) => {
        const norm  = v / maxAmp;
        const barH  = Math.max(1, Math.abs(norm) * (H / 2 - 3));
        const top   = norm >= 0 ? H / 2 - barH : H / 2;
        return (
          <View key={i} style={{
            position: 'absolute', left: i * step,
            top, width: Math.max(1, step - 0.3), height: barH,
            backgroundColor: norm >= 0 ? C.accent : C.warn, opacity: 0.9,
          }} />
        );
      })}
    </View>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [apiUrl,     setApiUrl]     = useState('http://10.154.142.137:8000');
  const [nodeId,     setNodeId]     = useState('BD-001');
  const [autoMode,   setAutoMode]   = useState(false);
  const [connected,  setConnected]  = useState(null);
  const [capturing,  setCapturing]  = useState(false);
  const [sending,    setSending]    = useState(false);
  const [sentCount,  setSentCount]  = useState(0);
  const [samples,    setSamples]    = useState([]);
  const [liveMag,    setLiveMag]    = useState('—');
  const [peakMag,    setPeakMag]    = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [logs,       setLogs]       = useState([]);

  const buf        = useRef([]);
  const isCapturing = useRef(false);
  const capTO      = useRef(null);
  const autoTimer  = useRef(null);
  const subRef     = useRef(null);

  // Load saved settings
  useEffect(() => {
    AsyncStorage.multiGet(['@url', '@node', '@auto']).then(pairs => {
      const map = Object.fromEntries(pairs.filter(([, v]) => v != null));
      if (map['@url'])  setApiUrl(map['@url']);
      if (map['@node']) setNodeId(map['@node']);
      if (map['@auto']) setAutoMode(map['@auto'] === 'true');
    });
  }, []);

  const addLog = useCallback((msg, type = '') => {
    const t = new Date().toLocaleTimeString('en', { hour12: false });
    setLogs(prev => [{ msg, type, t }, ...prev].slice(0, 60));
  }, []);

  // Accelerometer subscription
  useEffect(() => {
    Accelerometer.setUpdateInterval(SAMPLE_RATE_MS);
    subRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const val = Math.sqrt(x * x + y * y + z * z) - 1.0;
      setLiveMag(Math.abs(val).toFixed(2));
      if (!isCapturing.current) return;
      buf.current.push(val);
      const peak = Math.max(...buf.current.map(Math.abs));
      setPeakMag(peak);
      setSamples([...buf.current]);
      if (buf.current.length >= SAMPLE_TARGET) endCapture('done');
    });
    return () => subRef.current?.remove();
  }, []);

  // Auto-send loop
  useEffect(() => {
    clearInterval(autoTimer.current);
    if (autoMode) {
      autoTimer.current = setInterval(() => {
        if (!isCapturing.current && !sending) doCapture();
      }, AUTO_EVERY_MS);
    }
    AsyncStorage.setItem('@auto', String(autoMode));
    return () => clearInterval(autoTimer.current);
  }, [autoMode, sending]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  // AbortSignal.timeout is not available in Hermes — use AbortController instead
  function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  const refreshBtn = () => {};  // state drives button disabled directly

  async function testConnection() {
    const url = apiUrl.replace(/\/$/, '');
    await AsyncStorage.multiSet([['@url', apiUrl], ['@node', nodeId]]);
    addLog('Testing ' + url + '/api/health…');
    try {
      const r = await fetchWithTimeout(url + '/api/health', {}, 5000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      setConnected(true);
      addLog('Connected — ' + d.nodes + ' nodes, supabase=' + d.supabase, 'ok');
    } catch (e) {
      setConnected(false);
      addLog('Failed: ' + e.message, 'err');
    }
  }

  function doCapture() {
    if (isCapturing.current) return;
    buf.current   = [];
    isCapturing.current = true;
    setCapturing(true);
    setSamples([]);
    setPeakMag(0);
    addLog('Capturing 160 samples at 100 Hz…');
    capTO.current = setTimeout(() => endCapture('timeout'), CAPTURE_MS);
  }

  function endCapture(reason) {
    if (!isCapturing.current) return;
    isCapturing.current = false;
    clearTimeout(capTO.current);
    setCapturing(false);
    const data = [...buf.current];
    if (data.length < 8) {
      addLog('Only ' + data.length + ' samples — sensor may be slow', 'warn');
      return;
    }
    while (data.length < SAMPLE_TARGET) data.push(data[data.length - 1] || 0);
    addLog('Captured ' + data.length + ' samples (' + reason + ')');
    sendWindow(data);
  }

  async function sendWindow(data) {
    setSending(true);
    const url = apiUrl.replace(/\/$/, '');
    const payload = {
      node_id:       nodeId || 'BD-PHONE-01',
      sensor_window: data.slice(0, SAMPLE_TARGET),
      source:        'phone_layer',
      battery_pct:   100,
    };
    try {
      addLog('POST → ' + url + '/api/ingest');
      const r = await fetchWithTimeout(url + '/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 9000);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error('HTTP ' + r.status + ': ' + body.slice(0, 80));
      }
      const res = await r.json();
      setSentCount(c => c + 1);
      setConnected(true);
      const cls  = res.classification?.classification ?? '?';
      const conf = res.classification?.confidence != null
        ? (res.classification.confidence * 100).toFixed(0) + '%' : '';
      setLastResult({ cls, conf, confirmation: res.confirmation ?? '' });
      addLog('✓ ' + res.node_id + ': ' + cls + ' ' + conf, cls === 'event' ? 'warn' : 'ok');
    } catch (e) {
      addLog('Send error: ' + e.message, 'err');
      setConnected(false);
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const busy      = capturing || sending;
  const dotColor  = connected === null ? C.muted : connected ? C.ok : C.danger;
  const dotLabel  = connected === null ? 'Not tested' : connected ? 'Connected' : 'Disconnected';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.header}>
          <Text style={s.h1}>🌊 BhuDrishti</Text>
          <Text style={s.sub}>Phone Accelerometer → Flood Telemetry</Text>
        </View>

        {/* Config */}
        <View style={s.card}>
          <Text style={s.cardTitle}>CONFIGURATION</Text>
          <Text style={s.lbl}>Backend URL</Text>
          <TextInput style={s.input} value={apiUrl} onChangeText={setApiUrl}
            placeholder="http://10.154.142.137:8000" placeholderTextColor={C.muted}
            autoCapitalize="none" keyboardType="url" />
          <Text style={s.lbl}>Node ID</Text>
          <TextInput style={s.input} value={nodeId} onChangeText={setNodeId}
            placeholder="BD-PHONE-01" placeholderTextColor={C.muted}
            autoCapitalize="characters" />
          <View style={s.row}>
            <View style={[s.dot, { backgroundColor: dotColor }]} />
            <Text style={[s.dotLbl, { color: dotColor }]}>{dotLabel}</Text>
          </View>
          <TouchableOpacity style={s.btnSec} onPress={testConnection}>
            <Text style={s.btnSecTxt}>Test Connection</Text>
          </TouchableOpacity>
        </View>

        {/* Sensor */}
        <View style={s.card}>
          <Text style={s.cardTitle}>ACCELEROMETER</Text>
          <Waveform samples={samples} />
          <View style={s.stats}>
            {[
              [samples.length, 'Samples'],
              [liveMag, 'Live m/s²'],
              [peakMag.toFixed(2), 'Peak'],
              [sentCount, 'Sent'],
            ].map(([v, l]) => (
              <View key={l} style={s.statBox}>
                <Text style={s.statVal}>{v}</Text>
                <Text style={s.statLbl}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Last result */}
        {lastResult && (
          <View style={[s.card, { borderColor: lastResult.cls === 'event' ? C.danger : C.ok }]}>
            <Text style={s.cardTitle}>LAST RESULT</Text>
            <Text style={[s.resCls, { color: lastResult.cls === 'event' ? C.danger : C.ok }]}>
              {lastResult.cls.toUpperCase()} — {lastResult.conf}
            </Text>
            <Text style={s.resConf}>{lastResult.confirmation}</Text>
          </View>
        )}

        {/* Capture */}
        <View style={s.card}>
          <Text style={s.cardTitle}>CAPTURE & SEND</Text>
          <TouchableOpacity style={[s.btnPri, busy && s.btnDis]} onPress={doCapture} disabled={busy}>
            <Text style={s.btnPriTxt}>
              {capturing ? '⏺  Capturing…' : sending ? '⏳  Sending…' : 'Capture & Send (1.6 s)'}
            </Text>
          </TouchableOpacity>
          <View style={[s.row, { marginTop: 14, justifyContent: 'space-between' }]}>
            <Text style={{ color: C.text, fontSize: 14 }}>Auto-send every 5 s</Text>
            <Switch value={autoMode} onValueChange={setAutoMode}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor={autoMode ? '#fff' : C.muted} />
          </View>
          {autoMode && <Text style={{ color: C.warn, fontSize: 11, marginTop: 6 }}>
            Sending continuously — keep screen on
          </Text>}
        </View>

        {/* Log */}
        <View style={s.card}>
          <Text style={s.cardTitle}>LOG</Text>
          <View style={s.logBox}>
            {logs.slice(0, 20).map((l, i) => (
              <Text key={i} style={[s.logLine, {
                color: l.type === 'ok' ? C.ok : l.type === 'err' ? C.danger
                     : l.type === 'warn' ? C.warn : C.muted
              }]}>[{l.t}] {l.msg}</Text>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  scroll:  { padding: 16, paddingBottom: 40, gap: 12 },
  header:  { alignItems: 'center', marginVertical: 8 },
  h1:      { fontSize: 24, fontWeight: '700', color: C.text },
  sub:     { fontSize: 12, color: C.muted, marginTop: 4 },
  card:    { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  cardTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: C.muted, textTransform: 'uppercase', marginBottom: 12 },
  lbl:     { fontSize: 12, color: C.muted, marginBottom: 4 },
  input:   { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, color: C.text, fontSize: 14, marginBottom: 10 },
  row:     { flexDirection: 'row', alignItems: 'center' },
  dot:     { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  dotLbl:  { fontSize: 13, fontWeight: '600' },
  btnSec:  { borderWidth: 1, borderColor: C.accent, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  btnSecTxt: { color: C.accent, fontSize: 14, fontWeight: '600' },
  stats:   { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 8, alignItems: 'center' },
  statVal: { fontSize: 15, fontWeight: '700', color: C.text },
  statLbl: { fontSize: 9, color: C.muted, marginTop: 2 },
  resCls:  { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  resConf: { fontSize: 12, color: C.muted },
  btnPri:  { backgroundColor: C.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  btnDis:  { opacity: 0.4 },
  btnPriTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  logBox:  { backgroundColor: C.bg, borderRadius: 8, padding: 10, minHeight: 60 },
  logLine: { fontSize: 11, lineHeight: 18 },
});
