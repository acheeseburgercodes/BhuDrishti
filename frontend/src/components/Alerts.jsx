import { useEffect, useState } from 'react'
import { formatAge } from '@shared/freshness.js'
import { apiFetch } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { Badge, Button, Card, Empty } from './ui.jsx'

const LEVEL_TONE = { advisory: 'advisory', watch: 'watch', warning: 'danger' }
const STATUS_TONE = { pending_approval: 'advisory', approved: 'ok', rejected: 'neutral', open: 'advisory', resolved: 'neutral' }

function AlertMessage({ alert }) {
  const { lang } = useI18n()
  const [message, setMessage] = useState(null)
  useEffect(() => {
    let live = true
    apiFetch(`/api/alerts/${encodeURIComponent(alert.id)}/message?lang=${lang}`).then((m) => live && setMessage(m)).catch(() => live && setMessage(null))
    return () => { live = false }
  }, [alert.id, alert.level, lang])
  if (!message) return null
  return (
    <blockquote lang={message.lang} className="mt-2 rounded-lg border-l-4 border-line bg-surface px-3 py-2 text-sm text-ink">
      {message.text}
      <footer className="mt-1 text-xs text-muted">Draft · {message.provider}{message.note ? ` · ${message.note}` : ''}</footer>
    </blockquote>
  )
}

export function AlertsPanel({ alerts, now, onChanged }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const decide = async (alert, approve) => {
    setBusy(alert.id)
    setError('')
    try {
      await apiFetch(`/api/alerts/${encodeURIComponent(alert.id)}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { note: approve ? 'approved in dashboard' : 'rejected in dashboard' }, operator: true })
      onChanged?.()
    } catch (e) {
      setError(e.status === 401 || e.status === 403 ? 'Operator authorisation required. Add the operator token under Settings.' : e.message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card eyebrow="Human in the loop" title={t('alerts')} actions={<Badge tone="neutral">{alerts.filter((a) => a.status === 'pending_approval').length} pending</Badge>}>
      <p className="mb-3 text-xs text-muted">The system only drafts alerts. Advisory = one source; Watch = ESP32 and phone agree within 30 s. Nothing is sent to the public without operator approval.</p>
      {error && <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {alerts.length === 0 ? <Empty>{t('noAlerts')}</Empty> : (
        <ul className="space-y-2">
          {alerts.slice(0, 20).map((a) => (
            <li key={a.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={LEVEL_TONE[a.level] || 'advisory'} pulse={a.status === 'pending_approval'}>{a.level}</Badge>
                  <span className="font-medium text-ink">{a.node_name}</span>
                  <Badge tone={STATUS_TONE[a.status] || 'neutral'}>{a.status === 'pending_approval' ? t('pendingApproval') : a.status}</Badge>
                  {a.demo && <Badge tone="demo">Demo</Badge>}
                </div>
                <span className="text-xs text-muted">{formatAge(a.updated_at, now)} · conf. {Math.round((a.confidence || 0) * 100)}% · {(a.sources || []).join(' + ')}</span>
              </div>
              <AlertMessage alert={a} />
              {a.status === 'pending_approval' ? (
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" disabled={busy === a.id} onClick={() => decide(a, true)}>{t('approve')}</Button>
                  <Button variant="danger" disabled={busy === a.id} onClick={() => decide(a, false)}>{t('reject')}</Button>
                </div>
              ) : a.decided_by && <p className="mt-2 text-xs text-muted">Decided by {a.decided_by}{a.decision_note ? `: ${a.decision_note}` : ''}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
