import { LANGUAGES } from '@shared/contracts.js'
import { formatAge } from '@shared/freshness.js'
import { API } from '../lib/api.js'
import { isDemo } from '../lib/liveState.js'
import { useI18n } from '../lib/i18n.jsx'
import { Badge } from './ui.jsx'

const CONNECTION = {
  live: { tone: 'ok', label: 'Live stream', pulse: true },
  realtime: { tone: 'ok', label: 'Realtime', pulse: true },
  connecting: { tone: 'advisory', label: 'Connecting' },
  polling: { tone: 'advisory', label: 'Polling (stream down)' },
  offline: { tone: 'danger', label: 'API offline' },
}

export function StatusBar({ state, now, queue }) {
  const { lang, setLang, t } = useI18n()
  const connection = CONNECTION[state.connection] || CONNECTION.connecting
  const demo = isDemo(state)
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="mr-auto min-w-0">
          <p className="text-lg font-semibold tracking-tight text-ink">{t('appName')}</p>
          <p className="truncate text-xs text-muted">{t('tagline')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {demo
            ? <Badge tone="demo" title={state.dataOrigin === 'fixture' ? 'Bundled fixture: API unreachable' : 'Backend is running without Supabase'}>{t('demoData')}{state.dataOrigin === 'fixture' ? ' · offline fixture' : ''}</Badge>
            : <Badge tone="ok">{t('liveData')}</Badge>}
          <Badge tone={connection.tone} pulse={connection.pulse}>{connection.label}</Badge>
          <Badge tone="neutral" title={state.lastSyncAt || ''}>Synced {state.lastSyncAt ? formatAge(state.lastSyncAt, now) : 'never'}</Badge>
          {queue?.pending > 0 && <Badge tone="advisory">{queue.pending} {t('queued').toLowerCase()}</Badge>}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>{t('language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-lg border border-line bg-raised px-2 py-1 text-ink">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.nativeLabel}</option>)}
          </select>
        </label>
      </div>
      {state.error && state.connection === 'offline' && (
        <p role="status" className="border-t border-danger/30 bg-danger/10 px-4 py-2 text-center text-sm text-danger">
          Cannot reach {API}. Showing the bundled demo fixture; nothing on screen is a live reading.
        </p>
      )}
    </header>
  )
}

export function Disclaimer() {
  const { t } = useI18n()
  return <p className="mx-auto max-w-7xl px-4 pt-3 text-xs text-muted">{t('disclaimer')}</p>
}
