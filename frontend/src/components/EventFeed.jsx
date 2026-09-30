import { useMemo, useState } from 'react'
import { describeSource } from '@shared/contracts.js'
import { formatAge } from '@shared/freshness.js'
import { useI18n } from '../lib/i18n.jsx'
import { Badge, Card, Empty, SegmentedControl, Sparkline, cx } from './ui.jsx'

const pct = (v) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '—')

export function EventBadges({ event }) {
  const { t } = useI18n()
  const isEvent = event.classification?.classification === 'event'
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={isEvent ? 'watch' : 'ok'}>{isEvent ? 'Vibration event' : 'Normal'}</Badge>
      <Badge tone={event.source === 'phone_layer' ? 'accent' : 'neutral'}>{event.source === 'phone_layer' ? 'Phone' : 'ESP32'}</Badge>
      {isEvent && <Badge tone={event.cross_confirmation?.cross_confirmed ? 'watch' : 'neutral'}>{event.cross_confirmation?.cross_confirmed ? t('crossConfirmed') : t('singleSource')}</Badge>}
      {event.queued && <Badge tone="advisory">Replayed from queue</Badge>}
      {event.demo && <Badge tone="demo">Demo</Badge>}
      {event.synthetic_window && <Badge tone="demo" title="Detection trigger from hardware; waveform synthesised by the bridge">Synthetic waveform</Badge>}
      {event.quality?.flags?.length > 0 && <Badge tone="advisory">{event.quality.flags.join(', ')}</Badge>}
    </span>
  )
}

export function EventDetail({ event, now }) {
  if (!event) return <Empty>Select a reading to inspect its signal features and provenance.</Empty>
  const f = event.classification?.features || {}
  const rows = [
    ['Node', `${event.node_name} (${event.node_id})`],
    ['Device', event.device_id || '—'],
    ['Source', describeSource(event)],
    ['Transport', event.transport || 'unknown'],
    ['Recorded', `${new Date(event.recorded_at).toLocaleString()} (${formatAge(event.recorded_at, now)})`],
    ['Received', event.received_at ? new Date(event.received_at).toLocaleString() : '—'],
    ['Queued offline', event.queued ? `yes${event.queued_at ? `, since ${new Date(event.queued_at).toLocaleTimeString()}` : ''} · attempt ${event.attempt ?? 1}` : 'no'],
    ['Model confidence', pct(event.classification?.confidence)],
    ['Alert confidence', event.classification?.classification === 'event' ? pct(event.alert_confidence) : 'n/a'],
    ['Signal quality', `${pct(event.quality?.score)}${event.quality?.flags?.length ? ` (${event.quality.flags.join(', ')})` : ''}`],
    ['Cross-confirmation', event.cross_confirmation ? `${event.cross_confirmation.cross_confirmed ? 'yes' : 'no'} · sources: ${(event.cross_confirmation.sources || []).join(', ') || '—'} · ±${event.cross_confirmation.window_s ?? 30}s` : event.confirmation],
    ['Persistence', event.persistence || '—'],
  ]
  const features = [
    ['Peak amplitude', f.peak_amplitude?.toFixed(3)], ['RMS', f.rms?.toFixed(3)], ['Zero-crossing rate', f.zero_crossing_rate?.toFixed(3)],
    ['Dominant frequency', f.dominant_frequency_hz != null ? `${f.dominant_frequency_hz.toFixed(1)} Hz` : undefined],
    ['Decay envelope', f.decay_envelope?.toFixed(3)], ['Duration', f.duration_seconds != null ? `${f.duration_seconds.toFixed(2)} s` : undefined],
  ]
  return (
    <div className="space-y-3">
      <EventBadges event={event} />
      <Sparkline values={event.telemetry?.sensor_window || []} label="Sensor window" />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
        {features.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-mono text-ink">{v ?? '—'}</dd></div>)}
      </dl>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="text-muted">{k}</dt><dd className="text-right text-ink">{v}</dd></div>)}
      </dl>
    </div>
  )
}

export function EventFeed({ events, now, selectedId, onSelect, limit = 40, compact = false }) {
  const { t } = useI18n()
  const [filter, setFilter] = useState('all')
  const filtered = useMemo(() => events.filter((e) => filter === 'all'
    || (filter === 'event' && e.classification?.classification === 'event')
    || (filter === 'esp32' && e.source === 'esp32_node')
    || (filter === 'phone' && e.source === 'phone_layer')).slice(0, limit), [events, filter, limit])
  return (
    <Card eyebrow="Ingestion" title={t('events')} actions={!compact && (
      <SegmentedControl size="sm" label="Filter readings" value={filter} onChange={setFilter}
        options={[{ value: 'all', label: 'All' }, { value: 'event', label: 'Events' }, { value: 'esp32', label: 'ESP32' }, { value: 'phone', label: 'Phone' }]} />
    )}>
      {filtered.length === 0 ? <Empty>{t('noEvents')} Readings appear here as ESP32 bridges and phones submit them.</Empty> : (
        <ol className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1" aria-label="Recent readings, newest first">
          {filtered.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onSelect?.(e.id)} aria-pressed={selectedId === e.id}
                className={cx('w-full rounded-xl border px-3 py-2 text-left transition motion-safe:animate-rise', selectedId === e.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface')}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{e.node_name}</span>
                  <time className="text-xs text-muted" dateTime={e.recorded_at}>{formatAge(e.recorded_at, now)}</time>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <EventBadges event={e} />
                  <span>{describeSource(e)}</span>
                  {e.classification?.classification === 'event' && <span>alert conf. {pct(e.alert_confidence)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
