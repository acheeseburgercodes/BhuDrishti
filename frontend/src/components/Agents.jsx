import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { Badge, Button, Card, Empty } from './ui.jsx'

const COST_TONE = { local: 'ok', 'free-tier': 'accent', paid: 'advisory', test: 'neutral' }

function Output({ output }) {
  return (
    <dl className="mt-1 space-y-1 text-sm">
      {Object.entries(output).filter(([k]) => k !== 'confidence').map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="text-ink">{Array.isArray(v) ? (v.length ? <ul className="list-disc pl-5">{v.map((x, i) => <li key={i}>{String(x)}</li>)}</ul> : '—') : String(v || '—')}</dd>
        </div>
      ))}
    </dl>
  )
}

export function AgentsPanel({ disabled }) {
  const { lang } = useI18n()
  const [providers, setProviders] = useState([])
  const [run, setRun] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    apiFetch('/api/agents/providers').then(setProviders).catch(() => setProviders([]))
    apiFetch('/api/agents/runs?limit=1').then((r) => r[0] && setRun(r[0])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      setRun(await apiFetch('/api/agents/run', { method: 'POST', body: { language: lang }, operator: true, timeoutMs: 60000 }))
      load()
    } catch (e) {
      setError(e.status === 401 || e.status === 403 ? 'Operator authorisation required (Settings).' : e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card eyebrow="Advisory only" title="Agent orchestrator" actions={<Button variant="primary" onClick={start} disabled={busy || disabled}>{busy ? 'Running…' : 'Run agents'}</Button>}>
      <p className="mb-3 text-xs text-muted">Five bounded sub-agents. Deterministic rules always run; an optional LLM may refine wording but cannot downgrade rule findings or publish anything.</p>
      <details className="mb-3 rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Providers ({providers.filter((p) => p.configured).length} configured)</summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {providers.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1.5 text-sm">
              <span className="text-ink">{p.label}</span>
              <span className="flex gap-1"><Badge tone={COST_TONE[p.cost] || 'neutral'}>{p.cost}</Badge><Badge tone={p.configured ? (p.available ? 'ok' : 'advisory') : 'neutral'}>{p.configured ? (p.available ? 'ready' : 'cooling down') : 'no key'}</Badge></span>
            </li>
          ))}
        </ul>
      </details>
      {error && <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!run ? <Empty>No agent runs yet.</Empty> : (
        <div aria-live="polite" className="space-y-2">
          <p className="text-xs text-muted">Run {run.id} · {new Date(run.finished_at).toLocaleTimeString()} · providers: {run.providers_used.join(', ')}{run.demo ? ' · on demo data' : ''}</p>
          {run.agents.map((a) => (
            <article key={a.agent} className="rounded-xl border border-line p-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={a.used_fallback ? 'neutral' : 'accent'} title={(a.attempts || []).map((x) => `${x.provider}:${x.status}${x.reason ? `(${x.reason})` : ''}`).join(' → ')}>{a.provider}{a.model && a.model !== 'rules-v1' ? ` · ${a.model}` : ''}</Badge>
                  {typeof a.confidence === 'number' && <Badge tone="neutral">conf. {Math.round(a.confidence * 100)}%</Badge>}
                  {a.requires_approval && <Badge tone="advisory">needs approval</Badge>}
                  {a.llm_rejected && <Badge tone="advisory">LLM output rejected</Badge>}
                </span>
              </header>
              <Output output={a.output} />
              {a.translation && <p lang={a.translation.lang} className="mt-2 rounded-lg bg-surface px-2 py-1 text-sm">{a.translation.text} <span className="text-xs text-muted">({a.translation.provider})</span></p>}
            </article>
          ))}
        </div>
      )}
    </Card>
  )
}
