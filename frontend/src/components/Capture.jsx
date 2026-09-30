import { useCallback, useEffect, useRef, useState } from 'react'
import { OfflineQueue } from '@shared/queue.js'
import { makeClientEventId, validateTelemetry } from '@shared/contracts.js'
import { apiFetch } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { Badge, Button, Card, Sparkline } from './ui.jsx'

const SAMPLES = 160
const webStorage = { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) }
export const webQueue = new OfflineQueue(webStorage, { key: 'bhudrishti.web.outbox.v1' })
const send = (payload) => apiFetch('/api/ingest', { method: 'POST', body: payload })

export function useWebQueue() {
  const [status, setStatus] = useState(webQueue.status())
  useEffect(() => {
    const off = webQueue.subscribe(setStatus)
    webQueue.load()
    const flush = () => webQueue.flush(send).catch(() => {})
    const timer = setInterval(flush, 15000)
    window.addEventListener('online', flush)
    return () => { off(); clearInterval(timer); window.removeEventListener('online', flush) }
  }, [])
  return { status, flush: () => webQueue.flush(send, { force: true }) }
}

/** Browser phone-sensor capture for the web portal (the mobile app has the full flow). */
export function CapturePanel({ nodes, queue }) {
  const { t } = useI18n()
  const [nodeId, setNodeId] = useState('')
  const [state, setState] = useState('idle') // idle | capturing | sending
  const [message, setMessage] = useState('')
  const [samples, setSamples] = useState([])
  const buffer = useRef([])
  useEffect(() => { if (!nodeId && nodes[0]) setNodeId(nodes[0].id) }, [nodes, nodeId])

  const submit = useCallback(async (window) => {
    const payload = { node_id: nodeId, sensor_window: window, source: 'phone_layer', channel: 'web_portal', transport: 'http',
      client_event_id: makeClientEventId('w'), captured_at: new Date().toISOString(), sample_rate_hz: 60 }
    const check = validateTelemetry(payload)
    if (!check.ok) { setMessage(check.errors.join('; ')); setState('idle'); return }
    setState('sending')
    try {
      const event = await send(payload)
      setMessage(`Sent: ${event.classification.classification} (${Math.round(event.classification.confidence * 100)}% model confidence)`)
    } catch (error) {
      if (error.permanent) setMessage(`Rejected by server: ${error.message}`)
      else { await webQueue.enqueue(payload); setMessage(`Offline: saved to queue, will retry automatically (${error.message}).`) }
    } finally {
      setState('idle')
    }
  }, [nodeId])

  const capture = async () => {
    setMessage('')
    if (typeof window.DeviceMotionEvent === 'undefined') { setMessage(t('sensorUnavailable')); return }
    try {
      if (typeof window.DeviceMotionEvent.requestPermission === 'function' && (await window.DeviceMotionEvent.requestPermission()) !== 'granted') {
        setMessage(t('permissionDenied')); return
      }
    } catch { setMessage('Motion permission needs HTTPS (or localhost) on a phone.'); return }
    buffer.current = []
    setSamples([])
    setState('capturing')
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity
      if (!a) return
      buffer.current.push(Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2) - 9.81)
      if (buffer.current.length % 10 === 0) setSamples([...buffer.current])
    }
    window.addEventListener('devicemotion', onMotion)
    setTimeout(() => {
      window.removeEventListener('devicemotion', onMotion)
      const data = buffer.current.slice(0, SAMPLES)
      setSamples(data)
      if (data.length < 8) { setState('idle'); setMessage('No motion samples arrived. This browser or device may not expose the accelerometer.'); return }
      submit(data)
    }, 2700)
  }

  return (
    <Card eyebrow="Phone sensor (browser)" title={t('capture')}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-muted">Node
          <select value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="mt-1 block rounded-lg border border-line bg-raised px-2 py-1.5 text-ink">
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.id} · {n.name}</option>)}
          </select>
        </label>
        <Button variant="primary" onClick={capture} disabled={state !== 'idle' || !nodeId}>{state === 'capturing' ? t('capturing') : state === 'sending' ? t('sending') : t('captureStart')}</Button>
      </div>
      <Sparkline className="mt-3" values={samples} label="Captured motion" />
      <p role="status" className="mt-2 min-h-5 text-sm text-ink">{message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={queue.status.pending ? 'advisory' : 'ok'}>{queue.status.pending} {t('pendingSync')}</Badge>
        {queue.status.failed > 0 && <Badge tone="danger">{queue.status.failed} failed</Badge>}
        {queue.status.lastError && <span className="text-xs text-muted">last error: {queue.status.lastError}</span>}
        <Button onClick={queue.flush} disabled={!queue.status.pending || queue.status.flushing}>{t('syncNow')}</Button>
      </div>
    </Card>
  )
}
