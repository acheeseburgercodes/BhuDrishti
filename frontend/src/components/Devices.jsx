import { useI18n } from '../lib/i18n.jsx'
import { Badge, Card, Empty, FreshnessPill, cx } from './ui.jsx'

export function DeviceList({ nodes, now, selectedId, onSelect }) {
  const { t } = useI18n()
  return (
    <Card eyebrow="Registry" title={t('devices')} actions={<span className="text-xs text-muted">{nodes.length} registered</span>}>
      {nodes.length === 0 ? <Empty>No devices registered yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Nodes and devices with status, battery and last-seen time</caption>
            <thead className="text-left text-xs text-muted">
              <tr><th scope="col" className="py-1 font-medium">Node</th><th scope="col" className="font-medium">Type</th><th scope="col" className="font-medium">Status</th><th scope="col" className="font-medium">Battery</th><th scope="col" className="font-medium">{t('lastSeen')}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {nodes.map((n) => (
                <tr key={n.id} className={cx(selectedId === n.id && 'bg-accent/5')}>
                  <th scope="row" className="py-2 text-left font-normal">
                    <button type="button" className="text-left hover:underline" onClick={() => onSelect?.(n.id)}>
                      <span className="block font-medium text-ink">{n.name}</span>
                      <span className="block font-mono text-xs text-muted">{n.id}{n.device_id ? ` · ${n.device_id}` : ''}</span>
                    </button>
                  </th>
                  <td>{n.kind === 'phone' || n.source === 'phone_layer' ? 'Phone' : 'ESP32'}{n.location_estimated && <Badge className="ml-1" tone="advisory" title="Phone sent no location; placed at a reference node">approx. location</Badge>}</td>
                  <td><Badge tone={n.status === 'critical' ? 'watch' : n.status === 'offline' ? 'danger' : n.status === 'warning' ? 'advisory' : 'ok'}>{n.status || 'unknown'}</Badge>{n.demo && <Badge className="ml-1" tone="demo">demo</Badge>}</td>
                  <td className="font-mono">{typeof n.battery_pct === 'number' ? `${Math.round(n.battery_pct)}%` : '—'}</td>
                  <td><FreshnessPill lastSeen={n.last_seen} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Battery values reported by the ESP32 bridge default to 100% because the current firmware sends no battery telemetry.</p>
    </Card>
  )
}
