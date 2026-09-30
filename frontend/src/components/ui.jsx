/**
 * Small UI primitives. Original implementations; interaction patterns (segmented control
 * with sliding indicator, number ticker, status pill with pulse) are inspired by common
 * 21st.dev community components — no 21st.dev code was copied. See docs/UI_PROVENANCE.md.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { freshnessState, formatAge } from '@shared/freshness.js'

const cx = (...parts) => parts.filter(Boolean).join(' ')
export { cx }

const TONES = {
  neutral: 'border-line text-muted bg-raised',
  ok: 'border-ok/30 text-ok bg-ok/10',
  advisory: 'border-advisory/30 text-advisory bg-advisory/10',
  watch: 'border-watch/30 text-watch bg-watch/10',
  danger: 'border-danger/30 text-danger bg-danger/10',
  demo: 'border-demo/30 text-demo bg-demo/10',
  accent: 'border-accent/30 text-accent bg-accent/10',
}

export function Badge({ tone = 'neutral', children, className, pulse = false, ...rest }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)} {...rest}>
      {pulse && <span aria-hidden="true" className="size-1.5 rounded-full bg-current motion-safe:animate-pulse-ring" />}
      {children}
    </span>
  )
}

export function Card({ title, eyebrow, actions, children, className, as: Tag = 'section', ...rest }) {
  const id = useId()
  return (
    <Tag aria-labelledby={title ? id : undefined} className={cx('rounded-2xl border border-line bg-raised p-4 shadow-sm motion-safe:animate-rise', className)} {...rest}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {eyebrow && <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{eyebrow}</p>}
            {title && <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </Tag>
  )
}

/** Accessible radio-group styled as a segmented control with a sliding indicator. */
export function SegmentedControl({ label, options, value, onChange, size = 'md' }) {
  const refs = useRef({})
  const [indicator, setIndicator] = useState(null)
  useEffect(() => {
    const el = refs.current[value]
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options])
  const move = (delta) => {
    const index = options.findIndex((o) => o.value === value)
    const next = options[(index + delta + options.length) % options.length]
    onChange(next.value)
    refs.current[next.value]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex rounded-xl border border-line bg-surface p-0.5"
      onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) } }}>
      {indicator && <span aria-hidden="true" className="absolute top-0.5 bottom-0.5 rounded-[10px] bg-raised shadow-sm ring-1 ring-line transition-all duration-200" style={indicator} />}
      {options.map((o) => (
        <button key={o.value} ref={(el) => { refs.current[o.value] = el }} type="button" role="radio" aria-checked={value === o.value} tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 rounded-[10px] font-medium transition-colors', size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm', value === o.value ? 'text-ink' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Number that eases to its new value; renders the final value for screen readers. */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString() }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof value !== 'number' || typeof from.current !== 'number') { setShown(value); from.current = value; return undefined }
    const start = performance.now()
    const a = from.current
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 450)
      setShown(a + (value - a) * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <>
      <span aria-hidden="true">{typeof shown === 'number' ? format(shown) : shown}</span>
      <span className="sr-only">{typeof value === 'number' ? format(value) : value}</span>
    </>
  )
}

const FRESH_TONE = { live: 'ok', recent: 'accent', stale: 'advisory', offline: 'danger', never: 'neutral' }
const FRESH_LABEL = { live: 'Live', recent: 'Recent', stale: 'Stale', offline: 'Silent', never: 'Never seen' }

export function FreshnessPill({ lastSeen, now }) {
  const state = freshnessState(lastSeen, now)
  return <Badge tone={FRESH_TONE[state]} title={lastSeen || 'no timestamp'}>{FRESH_LABEL[state]} · {formatAge(lastSeen, now)}</Badge>
}

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

export function Empty({ children }) {
  return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{children}</p>
}

export function Button({ variant = 'secondary', className, ...rest }) {
  const styles = {
    primary: 'bg-accent text-white hover:opacity-90 dark:text-black',
    secondary: 'border border-line bg-raised text-ink hover:bg-surface',
    danger: 'border border-danger/40 text-danger hover:bg-danger/10',
    ghost: 'text-muted hover:text-ink',
  }
  return <button type="button" className={cx('inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)} {...rest} />
}

export function Sparkline({ values = [], label, className }) {
  if (values.length < 2) return <div className={cx('h-16 rounded-lg bg-surface', className)} role="img" aria-label={`${label}: no samples`} />
  const max = Math.max(1e-6, ...values.map(Math.abs))
  const w = 300
  const h = 64
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)},${(h / 2 - (v / max) * (h / 2 - 3)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cx('h-16 w-full rounded-lg bg-surface text-accent', className)} role="img" aria-label={`${label}: ${values.length} samples, peak ${max.toFixed(2)}`}>
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} className="stroke-line" strokeWidth="1" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
