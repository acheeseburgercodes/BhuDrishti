import { useEffect, useState } from 'react'
import { API, apiFetch, operatorToken } from '../lib/api.js'
import { Badge, Button, Card } from './ui.jsx'

export function SettingsPanel({ config, onSimulated }) {
  const [token, setToken] = useState(operatorToken.get())
  const [saved, setSaved] = useState(false)
  const [model, setModel] = useState(null)
  const [severity, setSeverity] = useState('critical')
  const [source, setSource] = useState('esp32_node')
  const [simMessage, setSimMessage] = useState('')
  useEffect(() => { apiFetch('/api/model').then(setModel).catch(() => {}) }, [])
  const simulate = async () => {
    try {
      const e = await apiFetch('/api/simulate-event', { method: 'POST', body: { severity, source } })
      setSimMessage(`Simulated ${e.source} reading at ${e.node_name}: ${e.classification.classification}`)
      onSimulated?.()
    } catch (error) { setSimMessage(error.message) }
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card eyebrow="Operator" title="Access">
        <p className="mb-2 text-sm text-muted">Privileged actions (approving alerts, running agents) use {config?.operator_auth === 'token' ? 'an operator token' : 'loopback-only access because no operator token is configured on the server'}. The token is kept in this browser tab's session storage only.</p>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); operatorToken.set(token.trim()); setSaved(true) }}>
          <label className="sr-only" htmlFor="op-token">Operator token</label>
          <input id="op-token" type="password" autoComplete="off" value={token} onChange={(e) => { setToken(e.target.value); setSaved(false) }} className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-1.5 text-ink" placeholder="Operator token" />
          <Button type="submit" variant="primary">Save</Button>
        </form>
        {saved && <p role="status" className="mt-2 text-sm text-ok">Saved for this session.</p>}
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">API</dt><dd className="font-mono">{API}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Mode</dt><dd><Badge tone={config?.mode === 'live' ? 'ok' : 'demo'}>{config?.mode || 'unknown'}</Badge></dd></div>
          <div className="flex justify-between"><dt className="text-muted">Realtime</dt><dd>{config?.realtime ? 'Supabase Realtime + backend stream' : 'Backend stream only'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Languages</dt><dd>{(config?.languages || []).map((l) => `${l.native}${l.translate ? ' (Sarvam)' : ''}`).join(', ') || 'static strings'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">Previous dashboard: <a className="underline" href="#legacy">legacy view</a>.</p>
      </Card>
      <Card eyebrow="Demo only" title="Simulator">
        <p className="mb-2 text-sm text-muted">Injects a synthetic reading. Every simulated event is labelled Demo everywhere it appears.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-muted">Scenario<select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 block rounded-lg border border-line bg-raised px-2 py-1.5 text-ink"><option value="normal">Normal</option><option value="watch">Rising</option><option value="critical">Impulsive event</option><option value="random">Random</option></select></label>
          <label className="text-sm text-muted">Source<select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 block rounded-lg border border-line bg-raised px-2 py-1.5 text-ink"><option value="esp32_node">ESP32</option><option value="phone_layer">Phone</option></select></label>
          <Button onClick={simulate}>Send simulated reading</Button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm">{simMessage}</p>
        {model && (
          <div className="mt-3 border-t border-line pt-3 text-sm">
            <p className="font-medium text-ink">Classifier: {model.model_type}</p>
            <p className="text-muted">Validation accuracy {(model.validation_accuracy * 100).toFixed(1)}% on {model.validation_samples} synthetic windows. {model.note}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
