/**
 * Visual demonstrations for the homepage: the hero "signal path" illustration and the
 * sensor-to-alert stepper. Both are explanatory illustrations, not live data.
 * Original code; the animated-beam / stepper ideas are common 21st.dev patterns
 * (see docs/UI_PROVENANCE.md).
 */
import { useRef, useState } from 'react'
import { cx } from '../components/ui.jsx'
import { usePrefersReducedMotion } from './primitives.jsx'

// River from a glacial lake (top right) down-valley (bottom left).
const RIVER = 'M470 46 C430 90 452 130 400 160 S300 205 290 250 S200 300 170 336 S80 380 30 404'
const NODES = [
  { id: 'lake', x: 462, y: 58, label: 'Upstream node' },
  { id: 'n2', x: 395, y: 164, label: 'Field node' },
  { id: 'n3', x: 288, y: 250, label: 'Field node' },
  { id: 'n4', x: 172, y: 334, label: 'Field node' },
]
const PHONES = [{ x: 330, y: 214 }, { x: 214, y: 300 }, { x: 120, y: 360 }, { x: 250, y: 282 }]
const HUB = { x: 96, y: 150 }
const beam = (n) => `M${n.x} ${n.y} Q${(n.x + HUB.x) / 2} ${Math.min(n.y, HUB.y) - 60} ${HUB.x} ${HUB.y}`

export function HeroArt() {
  const reduce = usePrefersReducedMotion()
  return (
    <svg viewBox="0 0 500 420" className="h-auto w-full" role="img"
      aria-label="Illustration: field nodes along a glacier-fed river and phones in nearby villages send readings to a review hub, where an operator checks them before any alert.">
      <defs>
        <linearGradient id="bd-ridge" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1d3b3e" /><stop offset="1" stopColor="#0b1a1c" />
        </linearGradient>
        <linearGradient id="bd-river" x1="1" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#bfeee6" /><stop offset=".5" stopColor="#56c2b4" /><stop offset="1" stopColor="#3b6fd0" />
        </linearGradient>
      </defs>
      {/* Ridges */}
      <path d="M0 250 L70 170 L120 205 L190 110 L250 170 L320 70 L380 120 L430 30 L500 90 L500 420 L0 420Z" fill="url(#bd-ridge)" opacity=".9" />
      <path d="M190 110 L172 132 L204 128Z M320 70 L300 96 L338 92Z M430 30 L414 52 L448 50Z" fill="#eef3ef" opacity=".85" />
      <path d="M0 330 L90 270 L160 300 L240 240 L330 290 L420 230 L500 270 L500 420 L0 420Z" fill="#0f2427" opacity=".85" />
      {/* Glacial lake + river */}
      <ellipse cx="470" cy="44" rx="22" ry="8" fill="#bfeee6" opacity=".9" />
      <path d={RIVER} fill="none" stroke="url(#bd-river)" strokeWidth="6" strokeLinecap="round" />
      {/* Signal beams to hub */}
      {NODES.map((n, i) => (
        <g key={n.id}>
          <path d={beam(n)} fill="none" stroke="#7fd6c9" strokeOpacity=".45" strokeWidth="1.5" className="signal-line" />
          {!reduce && (
            <circle r="3.5" fill="#f0b44c">
              <animateMotion dur={`${3 + i * 0.6}s`} begin={`${i * 0.7}s`} repeatCount="indefinite" path={beam(n)} />
            </circle>
          )}
        </g>
      ))}
      {PHONES.map((p, i) => (
        <g key={i}>
          <path d={`M${p.x} ${p.y} L${HUB.x} ${HUB.y}`} stroke="#8aaaea" strokeOpacity=".3" strokeWidth="1" className="signal-line" />
          <rect x={p.x - 4} y={p.y - 6} width="8" height="12" rx="2" fill="#8aaaea" />
        </g>
      ))}
      {NODES.map((n, i) => (
        <g key={`${n.id}-dot`}>
          <circle className="ping" style={{ '--ping-delay': `${i * 0.5}s` }} cx={n.x} cy={n.y} r="7" fill="none" stroke="#7fd6c9" strokeWidth="1.5" />
          <circle cx={n.x} cy={n.y} r="6" fill="#56c2b4" stroke="#0b1a1c" strokeWidth="2" />
        </g>
      ))}
      {/* Review hub */}
      <g>
        <rect x={HUB.x - 46} y={HUB.y - 22} width="92" height="44" rx="12" fill="#12292c" stroke="#f0b44c" strokeOpacity=".7" />
        <text x={HUB.x} y={HUB.y - 3} textAnchor="middle" fontSize="11" fill="#eef3ef" fontWeight="600">Human review</text>
        <text x={HUB.x} y={HUB.y + 12} textAnchor="middle" fontSize="9" fill="#a9bcb7">before any alert</text>
      </g>
    </svg>
  )
}

export const FLOW_STEPS = [
  { id: 'sense', title: 'Sense', who: 'ESP32 node · phone', body: 'An ESP32 field node samples ground vibration near the riverbank. Volunteers’ phones can add a short motion sample (about 1.6 s) from the app or browser portal.', fact: '8–2048 samples per reading' },
  { id: 'relay', title: 'Relay', who: 'Bridge · offline queue', body: 'Field nodes relay over BLE/Wi-Fi to a bridge that forwards to the backend. Phones keep a durable offline queue and retry with backoff when the network returns.', fact: 'Retries de-duplicated by client_event_id' },
  { id: 'validate', title: 'Validate', who: 'Ingestion API', body: 'Every reading is schema-checked (ids, sample counts, timestamps), rate-limited and de-duplicated before anything else happens.', fact: 'Rejects future-dated or malformed data' },
  { id: 'classify', title: 'Classify & score', who: 'Classifier · quality checks', body: 'A lightweight classifier labels the window. Quality checks (flatline, clipping, short window, low sample rate) can only lower confidence, never raise it.', fact: 'Quality flags shown to operators' },
  { id: 'confirm', title: 'Cross-confirm', who: 'Two independent sources', body: 'When an ESP32 node and a phone both flag an event at the same site within ±30 s, the reading is cross-confirmed. A single source stays an advisory at most.', fact: 'Watch requires cross-confirmation' },
  { id: 'review', title: 'Human review', who: 'Operator · agents', body: 'Draft alerts always start as “awaiting operator approval”. Advisory agents summarise evidence and draft text; only a person can approve or reject, and the decision is audited.', fact: 'Nothing is published automatically' },
  { id: 'notify', title: 'Notify', who: 'Portal · app feed', body: 'Approved notices appear in the portal and mobile alert feed in English, Nepali or Hindi, and always point people to official NDRRMA / DHM instructions.', fact: 'Prototype: no SMS or siren integration' },
]

/** Sensor-to-alert stepper: tablist with arrow-key navigation and an animated progress rail. */
export function FlowStepper() {
  const [active, setActive] = useState(0)
  const refs = useRef([])
  const step = FLOW_STEPS[active]
  const go = (i) => { const n = (i + FLOW_STEPS.length) % FLOW_STEPS.length; setActive(n); refs.current[n]?.focus() }
  const onKey = (e) => {
    const map = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: FLOW_STEPS.length - 1 }
    if (e.key in map) { e.preventDefault(); go(map[e.key]) }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div role="tablist" aria-label="Sensor-to-alert steps" aria-orientation="vertical" onKeyDown={onKey} className="relative flex flex-col gap-1">
        <span aria-hidden="true" className="absolute top-5 bottom-5 left-[1.15rem] w-px bg-line" />
        <span aria-hidden="true" className="absolute top-5 left-[1.15rem] w-px bg-accent transition-[height] duration-500"
          style={{ height: `calc((100% - 2.5rem) * ${active / (FLOW_STEPS.length - 1)})` }} />
        {FLOW_STEPS.map((s, i) => (
          <button key={s.id} ref={(el) => { refs.current[i] = el }} type="button" role="tab" id={`flow-tab-${s.id}`} aria-selected={i === active} aria-controls="flow-panel" tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={cx('relative flex min-h-11 items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left transition-colors', i === active ? 'bg-raised shadow-sm ring-1 ring-line' : 'hover:bg-raised/60')}>
            <span aria-hidden="true" className={cx('relative z-10 grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums transition-colors',
              i < active ? 'border-accent bg-accent text-on-accent' : i === active ? 'border-accent bg-raised text-accent' : 'border-line bg-surface text-muted')}>{i + 1}</span>
            <span className="min-w-0">
              <span className={cx('block text-sm font-semibold', i === active ? 'text-ink' : 'text-muted')}>{s.title}</span>
              <span className="block truncate text-xs text-muted">{s.who}</span>
            </span>
          </button>
        ))}
      </div>
      <div id="flow-panel" role="tabpanel" aria-labelledby={`flow-tab-${step.id}`} tabIndex={0} className="rounded-3xl border border-line bg-raised p-6">
        <div key={step.id} className="motion-safe:animate-rise">
          <p className="text-xs font-semibold tracking-[.14em] text-accent uppercase">Step {active + 1} of {FLOW_STEPS.length}</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{step.title}</h3>
          <p className="mt-1 text-sm text-muted">{step.who}</p>
          <p className="mt-4 text-base leading-relaxed text-ink">{step.body}</p>
          <p className="mt-4 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">{step.fact}</p>
          <div className="mt-6 flex gap-2">
            <button type="button" onClick={() => setActive(Math.max(0, active - 1))} disabled={active === 0}
              className="min-h-10 rounded-xl border border-line px-3 text-sm font-medium text-ink transition hover:border-accent/50 disabled:opacity-40">Previous step</button>
            <button type="button" onClick={() => setActive(Math.min(FLOW_STEPS.length - 1, active + 1))} disabled={active === FLOW_STEPS.length - 1}
              className="min-h-10 rounded-xl bg-accent px-3 text-sm font-medium text-on-accent transition hover:opacity-90 disabled:opacity-40">Next step</button>
          </div>
        </div>
      </div>
    </div>
  )
}
