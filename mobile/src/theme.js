import { StyleSheet } from 'react-native'

export const C = {
  bg: '#0d1413', surface: '#141d1b', line: '#26332f', ink: '#e7eeeb', muted: '#9aaba5',
  accent: '#2dd4bf', ok: '#4ade80', advisory: '#fbbf24', watch: '#fb923c', danger: '#f87171', demo: '#c4b5fd',
}

export const s = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 8 },
  body: { fontSize: 14, color: C.ink, lineHeight: 20 },
  muted: { fontSize: 12, color: C.muted, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, color: C.ink, fontSize: 15, marginBottom: 10, minHeight: 48 },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  btnText: { color: '#04201c', fontSize: 16, fontWeight: '700' },
  btnSecondary: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  btnSecondaryText: { color: C.ink, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
})
