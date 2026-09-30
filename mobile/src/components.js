import React from 'react'
import { Dimensions, Text, View } from 'react-native'
import { C, s } from './theme'

const TONE = { ok: C.ok, advisory: C.advisory, watch: C.watch, danger: C.danger, demo: C.demo, accent: C.accent, neutral: C.muted }

export function Badge({ tone = 'neutral', children }) {
  const color = TONE[tone] || C.muted
  return (
    <View style={{ borderWidth: 1, borderColor: color, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{children}</Text>
    </View>
  )
}

export function Card({ eyebrow, title, children, style }) {
  return (
    <View style={[s.card, style]} accessibilityRole="summary">
      {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={s.title} accessibilityRole="header">{title}</Text> : null}
      {children}
    </View>
  )
}

export function Waveform({ samples }) {
  const W = Dimensions.get('window').width - 66
  const H = 72
  const label = samples?.length ? `Waveform, ${samples.length} samples` : 'Waveform, no samples yet'
  if (!samples || samples.length < 2) return <View accessible accessibilityLabel={label} style={{ width: W, height: H, backgroundColor: C.bg, borderRadius: 8 }} />
  const max = Math.max(0.05, ...samples.map(Math.abs))
  const step = W / samples.length
  return (
    <View accessible accessibilityLabel={`${label}, peak ${max.toFixed(2)} g`} style={{ width: W, height: H, backgroundColor: C.bg, borderRadius: 8, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: H / 2, left: 0, right: 0, height: 1, backgroundColor: C.line }} />
      {samples.map((v, i) => {
        const h = Math.max(1, (Math.abs(v) / max) * (H / 2 - 3))
        return <View key={i} style={{ position: 'absolute', left: i * step, top: v >= 0 ? H / 2 - h : H / 2, width: Math.max(1, step - 0.3), height: h, backgroundColor: v >= 0 ? C.accent : C.advisory }} />
      })}
    </View>
  )
}

export function KV({ k, v }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 }}>
      <Text style={s.muted}>{k}</Text>
      <Text style={[s.body, { flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
    </View>
  )
}
