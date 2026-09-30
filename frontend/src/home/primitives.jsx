/**
 * Homepage primitives. Original implementations written for BhuDrishti. The interaction
 * ideas (scroll reveal, spotlight card, marquee, bento grid, accordion) are common patterns
 * on 21st.dev / Magic UI (MIT); no remote code was pasted. See docs/UI_PROVENANCE.md.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../components/ui.jsx'

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduce, setReduce] = useState(() => Boolean(window.matchMedia?.(query).matches))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return undefined
    const on = () => setReduce(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduce
}

/** True once the element has scrolled into view (always true without IntersectionObserver). */
export function useInView(ref, { once = true, rootMargin = '0px 0px -10% 0px' } = {}) {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); if (once) io.disconnect() } else if (!once) setInView(false)
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, once, rootMargin])
  return inView
}

/** Fades content up on first view. Content is always in the DOM for assistive tech. */
export function Reveal({ as: Tag = 'div', delay = 0, className, children, ...rest }) {
  const ref = useRef(null)
  const inView = useInView(ref)
  // Only content that starts below the fold is ever hidden, so first paint is never blank.
  const [armed, setArmed] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true)
  }, [])
  // Failsafe: never leave content hidden if the observer is throttled or never fires.
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 2500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Tag ref={ref} data-reveal={armed && !inView ? 'out' : 'in'} style={{ '--reveal-delay': `${delay}ms` }} className={cx('reveal', className)} {...rest}>
      {children}
    </Tag>
  )
}

export function SectionHeading({ eyebrow, title, id, children, align = 'left', tone = 'default' }) {
  const dark = tone === 'dark'
  return (
    <Reveal className={cx('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <p className={cx('text-xs font-semibold tracking-[.14em] uppercase', dark ? 'text-glacier' : 'text-accent')}>{eyebrow}</p>}
      <h2 id={id} className={cx('mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl', dark ? 'text-snow' : 'text-ink')}>{title}</h2>
      {children && <div className={cx('mt-3 text-base leading-relaxed text-pretty', dark ? 'text-mist' : 'text-muted')}>{children}</div>}
    </Reveal>
  )
}

/** Card with a pointer-following radial highlight. Purely decorative motion. */
export function SpotlightCard({ as: Tag = 'div', className, children, ...rest }) {
  const ref = useRef(null)
  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--x', `${e.clientX - r.left}px`)
    el.style.setProperty('--y', `${e.clientY - r.top}px`)
  }
  return (
    <Tag ref={ref} onPointerMove={onMove}
      className={cx('spotlight rounded-3xl border border-line bg-raised p-5 shadow-[0_1px_0_rgb(0_0_0/.03)] transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5', className)} {...rest}>
      {children}
    </Tag>
  )
}

/** Infinite ticker. Duplicate track is aria-hidden; pauses on hover/focus; static when reduced motion. */
export function Marquee({ items, label, className }) {
  const track = (hidden) => (
    <ul className="marquee-track" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item} className="flex shrink-0 items-center gap-2 text-sm whitespace-nowrap">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-60" />{item}
        </li>
      ))}
    </ul>
  )
  return (
    <div className={cx('marquee', className)} role="region" aria-label={label}>
      {track(false)}
      {track(true)}
    </div>
  )
}

/** Disclosure button + region. Used by the process cards and FAQ accordion. */
export function Disclosure({ summary, children, open, onToggle, className, buttonClassName, headingLevel = 3 }) {
  const id = useId()
  const H = `h${headingLevel}`
  return (
    <div className={className}>
      <H className="m-0">
        <button type="button" id={`${id}-btn`} aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}
          className={cx('flex w-full items-center justify-between gap-4 text-left', buttonClassName)}>
          <span className="min-w-0 flex-1">{summary}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={cx('size-5 shrink-0 text-muted transition-transform duration-300', open && 'rotate-45')}>
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </H>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} hidden={!open} className="motion-safe:animate-rise">
        {children}
      </div>
    </div>
  )
}

/** Single-open accordion (FAQ). */
export function Accordion({ items, defaultOpen = null }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="divide-y divide-line rounded-3xl border border-line bg-raised">
      {items.map((item, i) => (
        <Disclosure key={item.q} open={open === i} onToggle={() => setOpen(open === i ? null : i)}
          buttonClassName="min-h-12 px-5 py-4 text-base font-medium text-ink hover:text-accent"
          summary={item.q}>
          <div className="px-5 pb-5 text-sm leading-relaxed text-muted">{item.a}</div>
        </Disclosure>
      ))}
    </div>
  )
}

export function Pill({ tone = 'neutral', pulse, children, className }) {
  const tones = {
    neutral: 'border-white/15 bg-white/5 text-mist',
    live: 'border-glacier/30 bg-glacier/10 text-glacier',
    warn: 'border-saffron/30 bg-saffron/10 text-saffron',
    demo: 'border-[#b39cf2]/35 bg-[#b39cf2]/10 text-[#cdbdf7]',
  }
  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur', tones[tone], className)}>
      {pulse && (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}
