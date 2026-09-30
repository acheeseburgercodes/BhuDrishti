/**
 * Landing-page network status. Uses the shared API client (lib/api.js) for three public,
 * read-only endpoints and the same demo/fixture semantics as the portal (lib/liveState.js,
 * lib/useLiveData.js). It deliberately does not open the portal's WebSocket: it checks on
 * load, every minute while the tab is visible, and on demand.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { freshnessState } from '@shared/freshness.js'
import { apiFetch } from '../lib/api.js'
import { isDemo } from '../lib/liveState.js'
import { fixtureState } from '../lib/useLiveData.js'
import { portalHref } from '../lib/route.js'
import { cx } from '../components/ui.jsx'
import { Arrow } from './landing-ui.jsx'

const LOCALE = { en: 'en-GB', ne: 'ne-NP', hi: 'hi-IN' }
const TONE = {
  live: 'border-ok/30 bg-ok/10 text-ok',
  demo: 'border-demo/30 bg-demo/10 text-demo',
  offline: 'border-danger/30 bg-danger/10 text-danger',
  loading: 'border-line bg-sunken text-muted',
}

export function summarise(nodes, now = Date.now()) {
  const states = nodes.map((n) => freshnessState(n.last_seen, now))
  return {
    total: nodes.length,
    reporting: states.filter((s) => s === 'live' || s === 'recent').length,
    silent: states.filter((s) => s === 'offline' || s === 'never').length,
  }
}

async function check() {
  const opts = { timeoutMs: 6000 }
  try {
    const [health, nodes, pending] = await Promise.all([
      apiFetch('/api/health', opts), apiFetch('/api/nodes', opts), apiFetch('/api/alerts?status=pending_approval', opts),
    ])
    const kind = isDemo({ dataOrigin: 'api', config: { mode: health?.mode } }) ? 'demo' : 'live'
    return { kind, nodes: Array.isArray(nodes) ? nodes : [], pending: Array.isArray(pending) ? pending.length : null }
  } catch {
    return { kind: 'offline', nodes: fixtureState().nodes, pending: null }
  }
}

export function NetworkStatus({ c, lang = 'en', pollMs = 60000 }) {
  const [state, setState] = useState({ kind: 'loading', busy: true })
  const alive = useRef(true)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }))
    const result = await check()
    if (alive.current) setState({ ...result, busy: false, checkedAt: Date.now() })
  }, [])

  useEffect(() => {
    alive.current = true
    load()
    const timer = pollMs ? setInterval(() => { if (!document.hidden) load() }, pollMs) : null
    return () => { alive.current = false; if (timer) clearInterval(timer) }
  }, [load, pollMs])

  const { kind, busy } = state
  const loading = kind === 'loading'
  const s = loading ? null : summarise(state.nodes, state.checkedAt)
  const time = state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString(LOCALE[lang] || 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

  const rows = s && [
    { key: 'reporting', label: c('status.reporting'), value: s.reporting, detail: c('status.reportingDetail', { n: s.reporting, total: s.total }), tone: s.reporting ? 'text-ok' : 'text-ink' },
    { key: 'silent', label: c('status.silent'), value: s.silent, detail: c('status.silentDetail'), tone: s.silent ? 'text-danger' : 'text-ink' },
    { key: 'pending', label: c('status.pending'), value: state.pending ?? '—', detail: state.pending == null ? c('status.pendingOffline') : c('status.pendingDetail'), tone: state.pending ? 'text-advisory' : 'text-ink' },
  ]

  return (
    <section aria-labelledby="status-title" aria-busy={busy} className="rounded-2xl border border-line bg-raised p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="status-title" className="text-base font-semibold text-ink">{c('status.title')}</h2>
        <span data-testid="status-badge" className={cx('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold', TONE[kind])}>
          <span aria-hidden="true" className="size-2 rounded-full bg-current" />
          {loading ? c('status.refreshing') : c(`status.${kind}`)}
        </span>
      </div>

      <p role="status" className="mt-3 min-h-10 text-sm leading-relaxed text-muted">
        {loading ? c('status.loading') : c(`status.${kind}Note`)}
      </p>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        {loading
          ? [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3.5" aria-hidden="true">
              <span className="h-3.5 w-36 rounded bg-sunken" /><span className="h-6 w-10 rounded bg-sunken" />
            </div>
          ))
          : rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-4 py-3">
              <dt className="min-w-0">
                <span className="block text-sm font-medium text-ink">{r.label}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
              </dt>
              <dd className={cx('m-0 font-semibold text-2xl tabular-nums lining-nums', r.tone)}>{r.value}</dd>
            </div>
          ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={load} disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent disabled:cursor-progress disabled:opacity-60">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 4v3.5h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {busy ? c('status.refreshing') : c('status.refresh')}
        </button>
        <a href={portalHref('overview')} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline">
          {c('status.open')} <Arrow />
        </a>
        {time && <p className="w-full text-xs text-muted sm:ml-auto sm:w-auto">{c('status.checked', { time })}</p>}
      </div>
    </section>
  )
}
