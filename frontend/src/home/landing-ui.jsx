/**
 * Landing-page building blocks. Original BhuDrishti code (see docs/UI_PROVENANCE.md).
 * Motion is limited to colour/border hover feedback and a short fade on disclosure open;
 * the global reduced-motion rule in index.css disables even that.
 */
import { useId, useRef, useState } from 'react'
import { cx } from '../components/ui.jsx'

export const CONTAINER = 'mx-auto w-full max-w-6xl px-5 sm:px-8'

export function Section({ id, labelledBy, tone = 'plain', className, children }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cx(tone === 'sunken' && 'border-y border-line bg-sunken', className)}>
      <div className={cx(CONTAINER, 'py-16 sm:py-24')}>{children}</div>
    </section>
  )
}

export function Eyebrow({ children, className }) {
  return <p className={cx('eyebrow text-xs font-semibold text-accent', className)}>{children}</p>
}

export function SectionHeading({ id, eyebrow, title, lead, align = 'left', className }) {
  return (
    <div className={cx('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-3 font-display text-3xl leading-tight text-ink text-balance sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-base leading-relaxed text-muted text-pretty sm:text-lg">{lead}</p>}
    </div>
  )
}

const BUTTON = {
  primary: 'bg-accent text-on-accent hover:bg-[color-mix(in_srgb,var(--bd-accent)_88%,var(--bd-ink))]',
  secondary: 'border border-line bg-raised text-ink hover:border-accent/60 hover:text-accent',
  quiet: 'px-2 text-ink underline decoration-line decoration-2 underline-offset-4 hover:text-accent hover:decoration-accent',
}

export function ButtonLink({ href, variant = 'primary', className, children, ...rest }) {
  return (
    <a href={href} className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors', variant !== 'quiet' && 'px-5', BUTTON[variant], className)} {...rest}>
      {children}
    </a>
  )
}

export function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('rounded-2xl border border-line bg-raised p-5 shadow-card sm:p-6', className)} {...rest}>{children}</Tag>
}

/**
 * Radio group rendered as large toggle buttons (roving tabindex, arrow keys, Home/End).
 * Used for the coverage scenario and the notice-preview language.
 */
export function Choice({ label, options, value, onChange, className }) {
  const refs = useRef({})
  const onKey = (e) => {
    const i = options.findIndex((o) => o.value === value)
    const map = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }
    if (!(e.key in map)) return
    e.preventDefault()
    const next = options[(map[e.key] + options.length) % options.length]
    onChange(next.value)
    refs.current[next.value]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey}
      className={cx('grid gap-1 rounded-xl border border-line bg-sunken p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} ref={(el) => { refs.current[o.value] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} lang={o.lang}
            onClick={() => onChange(o.value)}
            className={cx('min-h-11 rounded-lg px-2 py-1.5 text-sm leading-tight font-medium transition-colors', on ? 'bg-raised text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Accordion of independent disclosures (WAI-ARIA accordion pattern, multiple open). */
export function Accordion({ items, headingLevel = 3 }) {
  const base = useId()
  const [open, setOpen] = useState(() => new Set())
  const refs = useRef([])
  const H = `h${headingLevel}`
  const toggle = (i) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })
  const onKey = (e, i) => {
    const map = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }
    if (!(e.key in map)) return
    e.preventDefault()
    refs.current[(map[e.key] + items.length) % items.length]?.focus()
  }
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-raised shadow-card">
      {items.map(([q, a], i) => {
        const expanded = open.has(i)
        return (
          <div key={q}>
            <H className="m-0">
              <button ref={(el) => { refs.current[i] = el }} type="button" id={`${base}-q${i}`} aria-expanded={expanded} aria-controls={`${base}-a${i}`}
                onClick={() => toggle(i)} onKeyDown={(e) => onKey(e, i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium text-ink transition-colors hover:text-accent sm:px-6">
                <span className="min-w-0 flex-1">{q}</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className={cx('size-5 shrink-0 text-muted transition-transform duration-200', expanded && 'rotate-180')}>
                  <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </H>
            <div id={`${base}-a${i}`} role="region" aria-labelledby={`${base}-q${i}`} hidden={!expanded} className="motion-safe:animate-rise">
              <p className="max-w-prose px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6 sm:text-base">{a}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Static Himalayan ridge silhouette over a river line. Decorative only. */
export function RidgeLine({ className }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 1200 120" preserveAspectRatio="none" className={cx('block h-16 w-full sm:h-24', className)}>
      <path d="M0 120V86l70-24 60 16 90-46 70 30 80-52 60 28 90-38 70 34 60-18 90 44 80-30 70 22 90-50 70 30 80-12 70 26v68Z" fill="var(--bd-ridge)" opacity=".55" />
      <path d="M0 120V98l110-18 90 14 120-26 110 22 130-20 110 16 140-22 110 18 120-10 160 20v28Z" fill="var(--bd-ridge)" />
      <path d="M370 10 352 22l20-3 24 3Zm150-10-28 12 26-3 27 3Zm460 2-22 12 24-3 26 3Z" fill="var(--bd-snowline)" opacity=".9" />
      <path d="M0 112c140-10 260 6 400-2s280-14 420-4 260 4 380-4" fill="none" stroke="var(--bd-accent)" strokeWidth="2.5" strokeLinecap="round" opacity=".7" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
