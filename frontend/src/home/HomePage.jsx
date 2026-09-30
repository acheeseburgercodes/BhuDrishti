/**
 * Public, explanatory homepage. Interactive elements are visual demonstrations; the live
 * system is the operator portal (#overview, #map, #agents …). Copy is deliberately honest
 * about prototype status. Component provenance: docs/UI_PROVENANCE.md.
 */
import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '@shared/contracts.js'
import { translate } from '@shared/i18n.js'
import { LogoMark, cx } from '../components/ui.jsx'
import { focusTarget, portalHref } from '../lib/route.js'
import { NetworkPreview } from './NetworkPreview.jsx'
import { Accordion, Disclosure, Marquee, Pill, Reveal, SectionHeading, SpotlightCard } from './primitives.jsx'
import { FlowStepper, HeroArt } from './SignalFlow.jsx'

export const NAV = [
  { id: 'problem', label: 'The problem' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'languages-agents', label: 'Languages & agents' },
  { id: 'limitations', label: 'Limitations' },
  { id: 'faq', label: 'FAQ' },
]

const TICKER = ['Rasuwagadhi', 'Syabrubesi', 'Dhunche', 'Betrawati', 'Trishuli Bazaar (Bidur)', 'Nuwakot', 'ESP32 field nodes', 'Phone sensor layer', '±30 s cross-confirmation', 'Operator approval', 'नेपाली · हिन्दी · English', 'Offline queue & retry']

function PrimaryLink({ href, children, className }) {
  return (
    <a href={href} className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-saffron px-5 text-sm font-semibold text-night shadow-lg shadow-saffron/10 transition hover:-translate-y-px hover:bg-[#f5c46d]', className)}>
      {children}
    </a>
  )
}

function SiteHeader() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const link = 'rounded-lg px-3 py-2 text-sm font-medium text-mist transition-colors hover:text-snow'
  return (
    <header className="on-dark sticky top-0 z-40 border-b border-white/10 bg-night/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <a href="#home" className="flex items-center gap-2.5 rounded-lg" aria-label="BhuDrishti home">
          <LogoMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight text-snow">BhuDrishti</span>
          <span className="hidden rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-medium text-mist sm:inline">Prototype</span>
        </a>
        <nav aria-label="Homepage" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => <li key={n.id}><a className={link} href={`#${n.id}`}>{n.label}</a></li>)}
          </ul>
        </nav>
        <PrimaryLink href={portalHref('overview')} className="ml-auto hidden sm:inline-flex lg:ml-2">Open portal</PrimaryLink>
        <button ref={buttonRef} type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)}
          className="ml-auto grid size-11 place-items-center rounded-xl border border-white/15 text-snow sm:ml-0 lg:hidden">
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
            {open
              ? <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      <nav id="mobile-menu" aria-label="Homepage mobile" hidden={!open} className="border-t border-white/10 px-4 pb-4 lg:hidden">
        <ul className="grid gap-1 pt-2">
          {NAV.map((n) => <li key={n.id}><a className={cx(link, 'block py-3 text-base')} href={`#${n.id}`} onClick={() => setOpen(false)}>{n.label}</a></li>)}
          <li className="pt-2"><PrimaryLink href={portalHref('overview')} className="w-full">Open operator portal</PrimaryLink></li>
        </ul>
      </nav>
    </header>
  )
}

const HERO_FACTS = [
  ['2', 'independent source types: ESP32 nodes and phones'],
  ['±30 s', 'window for cross-confirming a detection'],
  ['0', 'alerts published without operator approval'],
  ['3', 'interface languages: नेपाली, हिन्दी, English'],
]

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="on-dark contours relative overflow-hidden bg-night text-snow">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-20 lg:pb-24">
        <div>
          <Reveal className="flex flex-wrap gap-2">
            <Pill tone="live" pulse>Trishuli–Bhote Koshi corridor</Pill>
            <Pill tone="warn">Prototype · not a certified warning system</Pill>
          </Reveal>
          <Reveal delay={80}>
            <h1 id="hero-title" className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Community sensing for <span className="bg-gradient-to-r from-glacier to-[#8aaaea] bg-clip-text text-transparent">flood and glacial-lake</span> early warning.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist text-pretty">
              BhuDrishti (भूदृष्टि, “earth-sight”) links low-cost ESP32 field nodes with volunteers’ phones along a Himalayan river corridor,
              cross-checks their readings, shows where sensing is thin, and puts a person in charge of every alert.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-8 flex flex-wrap gap-3">
            <PrimaryLink href={portalHref('overview')}>Open the operator portal <span aria-hidden="true">→</span></PrimaryLink>
            <a href="#how-it-works" className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-5 text-sm font-semibold text-snow transition hover:border-glacier/60 hover:text-glacier">See how it works</a>
          </Reveal>
        </div>
        <Reveal delay={120} className="relative">
          <div className="rounded-[2rem] border border-white/10 bg-night-2/60 p-3 shadow-2xl shadow-black/40">
            <HeroArt />
          </div>
          <p className="mt-2 text-center text-xs text-mist">Illustration, not a live feed</p>
        </Reveal>
      </div>
      <div className="border-t border-white/10">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 sm:px-6 lg:grid-cols-4">
          {HERO_FACTS.map(([value, label], i) => (
            <Reveal key={label} delay={i * 70} className="py-6 pr-4">
              <dt className="sr-only">{label}</dt>
              <dd className="m-0">
                <span className="block text-3xl font-semibold tabular-nums text-snow">{value}</span>
                <span aria-hidden="true" className="mt-1 block text-sm text-mist">{label}</span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
      <div className="border-t border-white/10 py-4 text-mist">
        <Marquee items={TICKER} label="Corridor places and system vocabulary" />
      </div>
    </section>
  )
}

const PROBLEMS = [
  { title: 'Minutes, not hours', body: 'A glacial-lake outburst (GLOF) or cloudburst flood can travel down a steep valley faster than information does. Upstream sources can even sit across the border, out of sight of downstream villages.' },
  { title: 'Sparse, fragile sensing', body: 'Official gauges are few and far apart in steep terrain. Power, radio links and roads fail during exactly the events that matter.' },
  { title: 'Silence is ambiguous', body: 'A sensor that stops reporting might mean “all clear” or “washed away”. A warning system has to show missing evidence as clearly as it shows detections.' },
]

function Problem() {
  return (
    <section aria-labelledby="problem-title" id="problem" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Why it exists" id="problem-title" title="River valleys where warning time is short and evidence is thin">
        <p>The Trishuli–Bhote Koshi corridor runs from glacier-fed headwaters near the Tibet border down to Nuwakot. Settlements, roads and hydropower sit on the valley floor, close to the water.</p>
      </SectionHeading>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PROBLEMS.map((p, i) => (
          <Reveal key={p.title} delay={i * 90}>
            <SpotlightCard className="h-full">
              <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-gradient-to-r from-accent to-river" />
              <h3 className="mt-4 text-lg font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

const SOURCES = [
  { id: 'esp32', tag: 'Field layer', title: 'ESP32 field nodes', summary: 'Fixed vibration sensors near the riverbank.', details: ['Accelerometer windows sampled at the node and relayed over BLE/Wi-Fi to a bridge (SoftAP) that forwards to the backend.', 'Each node reports battery, status and reliability, which feed the coverage model.', 'An assumed ~3 km sensing range is used for planning; it is not a measured detection distance.'] },
  { id: 'phone', tag: 'Community layer', title: 'Phone sensor contributions', summary: 'Volunteers add motion samples from the app or browser.', details: ['The Expo companion app or web portal records a ~1.6 s motion sample with the user’s permission.', 'Readings wait in a durable offline queue and retry with backoff; duplicates are removed by client_event_id.', 'Phones are treated as a separate, shorter-range (~1 km assumed) source, which is what makes cross-confirmation meaningful.'] },
  { id: 'review', tag: 'Decision layer', title: 'Cross-confirmation & review', summary: 'Two independent sources, then a person.', details: ['Single-source detections can only become an advisory draft.', 'A “watch” draft needs an ESP32 node and a phone flagging the same site within ±30 s and sufficient confidence.', 'The system never sets a “warning” level automatically. Every draft waits for operator approval, and decisions are audited.'] },
]

function HowItWorks() {
  const [open, setOpen] = useState('esp32')
  return (
    <section aria-labelledby="how-title" id="how-it-works" className="border-y border-line bg-sunken/60">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="How it works" id="how-title" title="From a tremor on the riverbank to a reviewed notice">
          <p>Two kinds of sensors, one careful pipeline. Expand a layer, then step through what happens to a single reading.</p>
        </SectionHeading>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {SOURCES.map((s, i) => (
            <Reveal key={s.id} delay={i * 90}>
              <SpotlightCard className={cx('h-full p-0', open === s.id && 'border-accent/50')}>
                <Disclosure open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} buttonClassName="min-h-12 rounded-3xl p-5"
                  summary={(
                    <span className="block">
                      <span className="text-xs font-semibold tracking-[.14em] text-accent uppercase">{s.tag}</span>
                      <span className="mt-1 block text-lg font-semibold text-ink">{s.title}</span>
                      <span className="mt-1 block text-sm font-normal text-muted">{s.summary}</span>
                    </span>
                  )}>
                  <ul className="space-y-2 px-5 pb-5 text-sm leading-relaxed text-muted">
                    {s.details.map((d) => (
                      <li key={d} className="flex gap-2"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{d}</li>
                    ))}
                  </ul>
                </Disclosure>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12">
          <h3 className="mb-4 text-sm font-semibold tracking-[.14em] text-muted uppercase">Sensor-to-alert flow</h3>
          <FlowStepper />
        </Reveal>
      </div>
    </section>
  )
}

function Capabilities() {
  const tile = 'h-full'
  return (
    <section aria-labelledby="cap-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Capabilities" id="cap-title" title="Built to be honest about uncertainty" />
      <ul className="mt-10 grid auto-rows-fr gap-4 md:grid-cols-6">
        <Reveal as="li" className="md:col-span-4">
          <SpotlightCard className={cx(tile, 'bg-gradient-to-br from-raised to-accent/5')}>
            <p className="text-xs font-semibold tracking-[.14em] text-accent uppercase">Cross-confirmation</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">Two independent witnesses before a “watch”</h3>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">Alert confidence combines model confidence with signal quality and adds weight only when a field node and a phone agree. Every reading keeps its provenance: source, channel, transport, and whether it was replayed from a queue.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium" aria-label="Example evidence badges">
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent">ESP32 · event</span>
              <span className="rounded-full border border-river/30 bg-river/10 px-2.5 py-1 text-river">Phone · event</span>
              <span className="rounded-full border border-watch/30 bg-watch/10 px-2.5 py-1 text-watch">Cross-confirmed · watch draft</span>
            </div>
          </SpotlightCard>
        </Reveal>
        <Reveal as="li" delay={80} className="md:col-span-2">
          <SpotlightCard className={tile}>
            <p className="text-xs font-semibold tracking-[.14em] text-marigold uppercase">Human in the loop</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">Operator approval, always</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">Drafts start as “awaiting operator approval”. Approve and reject are audited.</p>
          </SpotlightCard>
        </Reveal>
        <Reveal as="li" className="md:col-span-2">
          <SpotlightCard className={tile}>
            <p className="text-xs font-semibold tracking-[.14em] text-river uppercase">Coverage map</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">See the gaps</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">A shared coverage model highlights risk-weighted areas with no fresh sensing evidence.</p>
          </SpotlightCard>
        </Reveal>
        <Reveal as="li" delay={80} className="md:col-span-2">
          <SpotlightCard className={tile}>
            <p className="text-xs font-semibold tracking-[.14em] text-accent uppercase">Resilient delivery</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">Offline-first capture</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">Queued readings retry when signal returns and never move a node’s “last seen” backwards.</p>
          </SpotlightCard>
        </Reveal>
        <Reveal as="li" delay={160} className="md:col-span-2">
          <SpotlightCard className={tile}>
            <p className="text-xs font-semibold tracking-[.14em] text-demo uppercase">Transparent demos</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">Demo data is labelled</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">Fixture and simulated readings carry a visible “Demo” label everywhere they appear.</p>
          </SpotlightCard>
        </Reveal>
      </ul>
    </section>
  )
}

function Coverage() {
  return (
    <section aria-labelledby="coverage-title" id="coverage" className="border-y border-line bg-sunken/60">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Real-time network coverage" id="coverage-title" title="A map of where the network can and cannot see">
          <p>The portal recomputes coverage continuously from node freshness, battery and reliability. This preview runs the same model on the demo seed. Try a scenario.</p>
        </SectionHeading>
        <Reveal className="mt-10"><NetworkPreview /></Reveal>
      </div>
    </section>
  )
}

const PLACE = { en: 'Syabrubesi', ne: 'स्याफ्रुबेसी', hi: 'स्याफ्रुबेसी' }
const AGENTS = [
  { title: 'Incident triage', body: 'Rates the latest evidence as no action, monitor, or review now.' },
  { title: 'Sensor quality check', body: 'Flags flatlines, clipping, low battery and stale nodes.' },
  { title: 'Coverage-gap analysis', body: 'Points to high-risk stretches without fresh coverage.' },
  { title: 'Notification drafting', body: 'Drafts plain-language notice text, only when rules found an alert.' },
  { title: 'Operator recommendations', body: 'Suggests next checks. Advises; never publishes.' },
]

function LanguagesAgents() {
  const [lang, setLang] = useState('ne')
  const refs = useRef({})
  const onKey = (e) => {
    const i = LANGUAGES.findIndex((l) => l.code === lang)
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = LANGUAGES[(i + d + LANGUAGES.length) % LANGUAGES.length].code
    setLang(next)
    refs.current[next]?.focus()
  }
  return (
    <section aria-labelledby="lang-title" id="languages-agents" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Multilingual & agents" id="lang-title" title="Clear words in the right language, with software that advises rather than decides" />
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <SpotlightCard className="h-full">
            <h3 className="text-lg font-semibold text-ink">Notice preview</h3>
            <p className="mt-1 text-sm text-muted">Sample template text from the app’s built-in strings. Choose a language:</p>
            <div role="radiogroup" aria-label="Preview language" onKeyDown={onKey} className="mt-4 inline-flex rounded-xl border border-line bg-surface p-0.5">
              {LANGUAGES.map((l) => (
                <button key={l.code} ref={(el) => { refs.current[l.code] = el }} type="button" role="radio" aria-checked={lang === l.code} tabIndex={lang === l.code ? 0 : -1}
                  onClick={() => setLang(l.code)}
                  className={cx('min-h-10 rounded-[10px] px-3 text-sm font-medium transition-colors', lang === l.code ? 'bg-raised text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}>
                  {l.nativeLabel}
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-3" aria-live="polite">
              <p lang={lang} className="rounded-2xl border-l-4 border-advisory bg-advisory/10 p-4 text-base leading-relaxed text-ink">{translate(lang, 'alertAdvisory', { place: PLACE[lang] })}</p>
              <p lang={lang} className="rounded-2xl border-l-4 border-watch bg-watch/10 p-4 text-base leading-relaxed text-ink">{translate(lang, 'alertWatch', { place: PLACE[lang] })}</p>
              <p lang={lang} className="text-xs text-muted">{translate(lang, 'disclaimer')}</p>
            </div>
            <p className="mt-4 text-xs text-muted">Dynamic text can be translated server-side through the Sarvam adapter when configured. Nepali and Hindi strings still need review by native speakers before field use.</p>
          </SpotlightCard>
        </Reveal>
        <Reveal delay={100}>
          <SpotlightCard className="h-full">
            <h3 className="text-lg font-semibold text-ink">The BhuDrishti agent system</h3>
            <p className="mt-1 text-sm text-muted">Five sub-agents run a deterministic rules baseline first. An optional language model may refine wording, but cannot downgrade rule findings or publish anything.</p>
            <ol className="mt-5 space-y-0">
              {AGENTS.map((a, i) => (
                <li key={a.title} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < AGENTS.length - 1 && <span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px bg-line" />}
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
                  <div>
                    <p className="font-medium text-ink">{a.title}</p>
                    <p className="text-sm text-muted">{a.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a href={portalHref('agents')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-accent">
              Open agents in the portal <span aria-hidden="true">→</span>
            </a>
          </SpotlightCard>
        </Reveal>
      </div>
    </section>
  )
}

const SCENARIOS = [
  { role: 'Ward volunteer, Syabrubesi', text: 'Her phone and the nearby field node both register strong vibration within a few seconds. The operator sees a cross-confirmed watch draft, checks signal quality, and approves a Nepali notice that tells people to follow local authority instructions.' },
  { role: 'District operator, Bidur', text: 'The gap map turns red around Trishuli Bazaar after node BD-005 goes silent. Instead of assuming all is well, the operator asks a volunteer to check the node and record phone samples meanwhile.' },
  { role: 'Field technician, Dhunche', text: 'The sensor-quality agent flags clipping and a low battery on one node. The technician reseats the sensor before monsoon season, and its reliability recovers in the coverage model.' },
]

function Scenarios() {
  return (
    <section aria-labelledby="scen-title" className="border-y border-line bg-sunken/60">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Field-use scenarios" id="scen-title" title="How it could be used">
          <p><strong className="font-semibold text-ink">Hypothetical scenarios</strong>, written to illustrate the workflow. They are not testimonials or reports of real events.</p>
        </SectionHeading>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {SCENARIOS.map((s, i) => (
            <Reveal as="li" key={s.role} delay={i * 90}>
              <SpotlightCard as="figure" className="m-0 h-full">
                <span className="rounded-full border border-demo/30 bg-demo/10 px-2 py-0.5 text-[11px] font-medium text-demo">Hypothetical</span>
                <blockquote className="mt-4 text-sm leading-relaxed text-ink">{s.text}</blockquote>
                <figcaption className="mt-4 text-sm font-medium text-muted">{s.role}</figcaption>
              </SpotlightCard>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

const LIMITS = [
  'It is a research prototype, not a certified or official warning system.',
  'The classifier detects unusual vibration; it does not measure water level, discharge or lake volume.',
  'Sensing ranges are assumptions, and the coverage model ignores terrain shielding and radio propagation.',
  'River lines and settlement positions are approximate (±1 km) demo data, not survey data.',
  'Nepali and Hindi text has not yet been reviewed by native speakers for field use.',
  'Public distribution (SMS, sirens, broadcast) is not integrated.',
]

function Limitations() {
  return (
    <section aria-labelledby="limits-title" id="limitations" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <SectionHeading eyebrow="Limitations" id="limits-title" title="What BhuDrishti is not">
          <p>Honesty about limits is a safety feature. If you are in the corridor, official guidance always comes first.</p>
        </SectionHeading>
        <Reveal>
          <div role="note" className="rounded-3xl border border-danger/30 bg-danger/5 p-6">
            <p className="text-base font-semibold text-ink">In an emergency, follow official instructions from NDRRMA, DHM and local authorities. Move to higher ground if told to, or if you see the river rise rapidly.</p>
            <p className="mt-2 text-sm text-muted">
              Official sources: <a className="font-medium text-accent underline underline-offset-2" href="https://bipad.gov.np" target="_blank" rel="noopener noreferrer">NDRRMA BIPAD portal<span className="sr-only"> (opens in new tab)</span></a>
              {' · '}<a className="font-medium text-accent underline underline-offset-2" href="https://www.dhm.gov.np" target="_blank" rel="noopener noreferrer">Department of Hydrology and Meteorology<span className="sr-only"> (opens in new tab)</span></a>
            </p>
          </div>
          <ul className="mt-5 space-y-3">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-3 text-sm leading-relaxed text-muted">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-marigold"><path d="M10 3 18 17H2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                {l}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

export const FAQ = [
  { q: 'Is BhuDrishti an official warning system?', a: 'No. It is a prototype for exploring community sensing. It is not certified and does not replace NDRRMA, DHM or local authority warnings.' },
  { q: 'Can it predict a glacial-lake outburst?', a: 'No. It looks for unusual ground vibration near the river and shows where sensing evidence is missing. It does not forecast floods or monitor lake levels.' },
  { q: 'Why combine ESP32 nodes with phones?', a: 'They fail in different ways. A fixed node can be noisy or offline; a phone can be moved or dropped. Agreement between the two within ±30 s is stronger evidence than either alone.' },
  { q: 'Who decides whether an alert goes out?', a: 'A human operator. Rules and agents prepare drafts and recommendations, but every alert waits for approval and the decision is recorded.' },
  { q: 'What happens when the network is down?', a: 'Phones queue readings locally and retry. The portal falls back from live streaming to polling and then to a clearly labelled demo fixture, so it never presents stale data as live.' },
  { q: 'Is the map on this page live?', a: 'No. The homepage preview is simulated from the demo seed. The live coverage map is in the operator portal.' },
]

function Faq() {
  return (
    <section aria-labelledby="faq-title" id="faq" className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
      <SectionHeading eyebrow="FAQ" id="faq-title" title="Common questions" align="center" />
      <Reveal className="mt-8"><Accordion items={FAQ} /></Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="on-dark contours bg-night text-mist">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-night-2/70 p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-snow">See the corridor as operators do</h2>
            <p className="mt-1 text-sm">Live readings, coverage, alerts awaiting review and agent runs. Demo data is labelled.</p>
          </div>
          <PrimaryLink href={portalHref('overview')}>Open the operator portal <span aria-hidden="true">→</span></PrimaryLink>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold text-snow"><LogoMark className="size-7" /> BhuDrishti</p>
            <p className="mt-2 text-sm">Trishuli–Bhote Koshi early-warning prototype.</p>
          </div>
          <nav aria-label="Portal shortcuts">
            <h3 className="text-sm font-semibold text-snow">Portal</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {[['overview', 'Overview'], ['map', 'Coverage map'], ['alerts', 'Alerts review'], ['agents', 'Agents'], ['capture', 'Phone capture']].map(([id, label]) => (
                <li key={id}><a className="hover:text-snow" href={portalHref(id)}>{label}</a></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Homepage sections">
            <h3 className="text-sm font-semibold text-snow">Learn</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((n) => <li key={n.id}><a className="hover:text-snow" href={`#${n.id}`}>{n.label}</a></li>)}
            </ul>
          </nav>
          <div>
            <h3 className="text-sm font-semibold text-snow">Safety</h3>
            <p className="mt-3 text-sm">Prototype only. Not a certified warning system. Follow official NDRRMA / DHM instructions.</p>
          </div>
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-xs">Map data in the portal © OpenStreetMap contributors. Node and settlement positions shown on this page are demo values.</p>
      </div>
    </footer>
  )
}

export default function HomePage({ section }) {
  useEffect(() => { document.title = 'BhuDrishti · Community flood & GLOF early-warning prototype' }, [])
  useEffect(() => {
    if (!section) return undefined
    const t = setTimeout(() => focusTarget(section), 0)
    return () => clearTimeout(t)
  }, [section])
  return (
    <div className="min-h-screen bg-surface">
      <a href="#main" onClick={(e) => { e.preventDefault(); focusTarget('main') }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-raised focus:px-3 focus:py-2 focus:text-ink">Skip to content</a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Problem />
        <HowItWorks />
        <Capabilities />
        <Coverage />
        <LanguagesAgents />
        <Scenarios />
        <Limitations />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
