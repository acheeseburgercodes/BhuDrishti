/**
 * Public landing page (routes: empty hash, #home, and the section hashes in SECTIONS).
 * Copy is translated through the shared LanguageProvider (home/copy.js); the theme comes
 * from lib/theme.jsx. Live figures come only from NetworkStatus, which states whether they
 * are live, demo or from the offline fixture. Portal deep links (#overview, #map, #alerts,
 * #agents …) are plain links handled by lib/route.js. Provenance: docs/UI_PROVENANCE.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { LANGUAGES } from '@shared/contracts.js'
import { translate } from '@shared/i18n.js'
import { LogoMark, cx } from '../components/ui.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { focusTarget, portalHref } from '../lib/route.js'
import { ThemeToggle } from '../lib/theme.jsx'
import { makeCopy } from './copy.js'
import { Accordion, Arrow, ButtonLink, CONTAINER, Card, Choice, Eyebrow, RidgeLine, Section, SectionHeading } from './landing-ui.jsx'
import { NetworkPreview } from './NetworkPreview.jsx'
import { NetworkStatus } from './NetworkStatus.jsx'

/** Section ids double as hashes. None may collide with a portal tab (see lib/route.js). */
export const SECTIONS = [
  { id: 'how-it-works', key: 'how' },
  { id: 'coverage', key: 'coverage' },
  { id: 'alert-workflow', key: 'workflow' },
  { id: 'languages-agents', key: 'languages' },
  { id: 'limitations', key: 'limits' },
  { id: 'faq', key: 'faq' },
]
/** Hashes used by the previous homepage that should still land somewhere sensible. */
export const SECTION_ALIASES = { problem: 'how-it-works', 'alert-flow': 'alert-workflow', languages: 'languages-agents' }

function LanguageSelect({ c, id }) {
  const { lang, setLang } = useI18n()
  return (
    <label htmlFor={id} className="relative flex items-center text-ink">
      <span className="sr-only">{c('header.language')}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3 size-4 text-muted">
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.75 10h14.5M10 2.75c2 2 3 4.4 3 7.25s-1 5.25-3 7.25c-2-2-3-4.4-3-7.25s1-5.25 3-7.25Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <select id={id} value={lang} onChange={(e) => setLang(e.target.value)}
        className="bd-select min-h-11 w-full cursor-pointer rounded-xl border border-line bg-raised pr-9 pl-9 text-sm font-medium text-ink transition-colors hover:border-accent/60">
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.nativeLabel}</option>)}
      </select>
    </label>
  )
}

function SiteHeader({ c }) {
  const [open, setOpen] = useState(false)
  const headerRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    const onPointer = (e) => { if (!headerRef.current?.contains(e.target)) setOpen(false) }
    const mq = window.matchMedia?.('(min-width: 80rem)')
    const onWide = () => { if (mq.matches) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    mq?.addEventListener?.('change', onWide)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      mq?.removeEventListener?.('change', onWide)
    }
  }, [open])

  const close = () => setOpen(false)
  const themeLabels = { toDark: c('header.toDark'), toLight: c('header.toLight') }

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className={cx(CONTAINER, 'flex h-16 items-center gap-3')}>
        <a href="#home" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg" aria-label={c('header.home')}>
          <LogoMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight text-ink">BhuDrishti</span>
          <span className="hidden rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted md:inline">{c('header.prototype')}</span>
        </a>

        <nav aria-label={c('nav.label')} className="ml-auto hidden xl:block">
          <ul className="flex items-center">
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted transition-colors hover:text-ink">{c(`nav.${s.key}`)}</a></li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-3">
          <div className="hidden w-32 sm:block"><LanguageSelect c={c} id="lang-header" /></div>
          <div className="hidden sm:block"><ThemeToggle labels={themeLabels} /></div>
          {/* Primary action stays visible at every width; compact padding below sm. */}
          <ButtonLink href={portalHref('map')} className="!px-3.5 whitespace-nowrap sm:!px-5">{c('header.openMap')}</ButtonLink>
          <button ref={buttonRef} type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-xl border border-line bg-raised text-ink transition-colors hover:border-accent/60 xl:hidden">
            <span className="sr-only">{open ? c('header.menuClose') : c('header.menuOpen')}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
              {open
                ? <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      <div id="site-menu" hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-surface shadow-card motion-safe:animate-rise xl:hidden">
        <div className={cx(CONTAINER, 'py-4')}>
          <nav aria-label={`${c('nav.label')} (menu)`}>
            <ul className="grid gap-0.5 sm:grid-cols-2 sm:gap-x-6">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} onClick={close} className="flex min-h-12 items-center rounded-lg px-2 text-base font-medium text-ink transition-colors hover:bg-sunken">{c(`nav.${s.key}`)}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 sm:hidden">
            <div className="flex-1"><LanguageSelect c={c} id="lang-menu" /></div>
            <ThemeToggle labels={themeLabels} />
          </div>
          <div className="mt-4">
            <ButtonLink href={portalHref('overview')} variant="secondary" onClick={close} className="w-full sm:w-auto">{c('header.portal')} <Arrow /></ButtonLink>
          </div>
        </div>
      </div>
    </header>
  )
}

function Hero({ c, lang }) {
  return (
    <section aria-labelledby="hero-title" className="border-b border-line">
      <div className={cx(CONTAINER, 'grid gap-10 pt-12 pb-10 sm:pt-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:pt-20 lg:pb-14')}>
        <div className="motion-safe:animate-rise">
          <Eyebrow>{c('hero.eyebrow')}</Eyebrow>
          <h1 id="hero-title" className="mt-4 font-display text-[2rem] leading-[1.12] text-ink text-balance sm:text-5xl lg:text-[3.25rem]">{c('hero.title')}</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">{c('hero.lead')}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={portalHref('map')} className="w-full min-[420px]:w-auto">{c('hero.ctaMap')} <Arrow /></ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary" className="w-full min-[420px]:w-auto">{c('hero.ctaHow')}</ButtonLink>
            <ButtonLink href={portalHref('overview')} variant="quiet">{c('hero.ctaPortal')}</ButtonLink>
          </div>
          <p className="mt-8 max-w-xl border-l-2 border-marigold pl-3 text-sm leading-relaxed text-muted">{c('hero.notice')}</p>
        </div>
        <NetworkStatus c={c} lang={lang} />
      </div>
      <RidgeLine />
    </section>
  )
}

function SensorIcon({ kind }) {
  return (
    <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-line bg-sunken text-accent">
      {kind === 'phone'
        ? <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" strokeLinecap="round" /></svg>
        : <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="6" y="9" width="12" height="10" rx="2" /><path d="M12 9V5M8.5 3.5a5 5 0 0 1 7 0M3 16h3M18 16h3" /></svg>}
    </span>
  )
}

function HowItWorks({ c }) {
  const rows = c('how.rows')
  const steps = c('how.steps')
  return (
    <Section id="how-it-works" labelledBy="how-title">
      <SectionHeading id="how-title" eyebrow={c('how.eyebrow')} title={c('how.title')} lead={c('how.lead')} />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {[['esp32', 'esp32'], ['phone', 'phone']].map(([key, icon]) => (
          <Card key={key}>
            <SensorIcon kind={icon} />
            <h3 className="mt-4 text-lg font-semibold text-ink">{c(`how.${key}Title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{c(`how.${key}Body`)}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-raised shadow-card">
        <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
          <caption className="border-b border-line px-5 py-3 text-left text-sm font-semibold text-ink">{c('how.tableCaption')}</caption>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="w-[30%] px-5 py-2.5 font-medium"><span className="sr-only">{c('how.colAspect')}</span></th>
              <th scope="col" className="px-3 py-2.5 font-semibold text-accent">{c('how.colEsp32')}</th>
              <th scope="col" className="px-3 py-2.5 pr-5 font-semibold text-river">{c('how.colPhone')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {rows.map(([aspect, a, b]) => (
              <tr key={aspect} className="align-top">
                <th scope="row" className="px-5 py-3 font-medium text-ink">{aspect}</th>
                <td className="px-3 py-3 text-muted">{a}</td>
                <td className="px-3 py-3 pr-5 text-muted">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-16 text-sm font-semibold text-ink">{c('how.stepsTitle')}</h3>
      <ol className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 sm:gap-y-6 lg:grid-cols-5">
        {steps.map(([title, body], i) => (
          <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 border-t-2 border-line pt-3 first:border-accent sm:block sm:pt-4">
            <p className="pt-0.5 text-sm font-semibold text-accent tabular-nums lining-nums">{String(i + 1).padStart(2, '0')}</p>
            <div>
              <p className="font-semibold text-ink sm:mt-1">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Coverage({ c }) {
  return (
    <Section id="coverage" labelledBy="coverage-title" tone="sunken">
      <SectionHeading id="coverage-title" eyebrow={c('coverage.eyebrow')} title={c('coverage.title')} lead={c('coverage.lead')} />
      <div className="mt-12"><NetworkPreview c={c} /></div>
    </Section>
  )
}

const LEVEL_TONE = {
  advisory: 'border-advisory/35 bg-advisory/10 text-advisory',
  watch: 'border-watch/35 bg-watch/10 text-watch',
  warning: 'border-danger/35 bg-danger/10 text-danger',
}

function LevelBadge({ level, children }) {
  return <span className={cx('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', LEVEL_TONE[level])}>{children}</span>
}

function Workflow({ c }) {
  const steps = c('workflow.steps')
  const levels = c('workflow.levels')
  return (
    <Section id="alert-workflow" labelledBy="workflow-title">
      <SectionHeading id="workflow-title" eyebrow={c('workflow.eyebrow')} title={c('workflow.title')} lead={c('workflow.lead')} />
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        <ol className="relative">
          {steps.map(([title, body, level], i) => (
            <li key={title} className="relative flex gap-4 pb-8 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-10 bottom-0 left-5 w-px bg-line" />}
              <span aria-hidden="true" className={cx('relative grid size-10 shrink-0 place-items-center rounded-full border font-semibold text-base tabular-nums lining-nums',
                i === 2 ? 'border-accent bg-accent text-on-accent' : 'border-line bg-raised text-ink')}>{i + 1}</span>
              <div className="min-w-0 pt-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{title}</h3>
                  {level && <LevelBadge level={level}>{levels[level]}</LevelBadge>}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted sm:text-base">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="grid content-start gap-4">
          <Card>
            <h3 className="text-sm font-semibold text-ink">{c('workflow.levelsTitle')}</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3"><LevelBadge level="advisory">{levels.advisory}</LevelBadge><span className="text-right text-muted">{c('workflow.steps')[0][0]}</span></li>
              <li className="flex items-center justify-between gap-3"><LevelBadge level="watch">{levels.watch}</LevelBadge><span className="text-right text-muted">{c('workflow.steps')[1][0]}</span></li>
              <li className="flex items-center justify-between gap-3"><LevelBadge level="warning">{levels.warning}</LevelBadge><span className="text-right text-muted">{c('workflow.warningNote')}</span></li>
            </ul>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-ink">{c('workflow.neverTitle')}</h3>
            <ul className="mt-4 space-y-3">
              {c('workflow.never').map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink">
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-danger"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5 15 15 5" stroke="currentColor" strokeWidth="1.6" /></svg>
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <ButtonLink href={portalHref('alerts')} variant="secondary" className="w-full sm:w-fit">{c('workflow.open')} <Arrow /></ButtonLink>
        </div>
      </div>
    </Section>
  )
}

function LanguagesAgents({ c, lang }) {
  const [preview, setPreview] = useState(lang)
  useEffect(() => { setPreview(lang) }, [lang])
  const place = makeCopy(preview)('languages.place')
  const options = LANGUAGES.map((l) => ({ value: l.code, label: l.nativeLabel, lang: l.code }))
  return (
    <Section id="languages-agents" labelledBy="lang-title" tone="sunken">
      <SectionHeading id="lang-title" eyebrow={c('languages.eyebrow')} title={c('languages.title')} />
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col">
          <h3 className="text-lg font-semibold text-ink">{c('languages.previewTitle')}</h3>
          <p className="mt-1 text-sm text-muted">{c('languages.previewLead')}</p>
          <Choice className="mt-4" label={c('languages.previewLabel')} options={options} value={preview} onChange={setPreview} />
          <div className="mt-5 space-y-3" aria-live="polite">
            <p lang={preview} data-testid="notice-advisory" className="rounded-xl border-l-4 border-advisory bg-advisory/10 p-4 text-base leading-relaxed text-ink">{translate(preview, 'alertAdvisory', { place })}</p>
            <p lang={preview} className="rounded-xl border-l-4 border-watch bg-watch/10 p-4 text-base leading-relaxed text-ink">{translate(preview, 'alertWatch', { place })}</p>
            <p lang={preview} className="text-xs leading-relaxed text-muted">{translate(preview, 'disclaimer')}</p>
          </div>
          <div className="mt-6 space-y-2 border-t border-line pt-4 text-sm leading-relaxed text-muted">
            <p>{c('languages.sarvam')}</p>
            <p>{c('languages.review')}</p>
          </div>
        </Card>
        <Card className="flex flex-col">
          <h3 className="text-lg font-semibold text-ink">{c('languages.agentsTitle')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{c('languages.agentsLead')}</p>
          <ol className="mt-5 divide-y divide-line border-y border-line">
            {c('languages.agents').map(([title, body], i) => (
              <li key={title} className="flex gap-4 py-3.5">
                <span aria-hidden="true" className="w-5 shrink-0 pt-0.5 font-semibold text-sm text-accent tabular-nums lining-nums">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-medium text-ink">{title}</p>
                  <p className="text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <ButtonLink href={portalHref('agents')} variant="secondary" className="mt-6 w-full sm:w-fit">{c('languages.open')} <Arrow /></ButtonLink>
        </Card>
      </div>
    </Section>
  )
}

function ExternalLink({ href, children, c }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
      {children}<span className="sr-only"> {c('limits.newTab')}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-1 size-3.5"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  )
}

function Limitations({ c }) {
  return (
    <Section id="limitations" labelledBy="limits-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
        <SectionHeading id="limits-title" eyebrow={c('limits.eyebrow')} title={c('limits.title')} lead={c('limits.lead')} />
        <div>
          <div role="note" aria-label={c('limits.official')} className="rounded-2xl border border-danger/35 bg-danger/5 p-5 sm:p-6">
            <p className="text-base leading-relaxed font-semibold text-ink">{c('limits.emergency')}</p>
            <p className="mt-3 text-sm font-medium text-muted">{c('limits.official')}</p>
            <ul className="mt-1 flex flex-col gap-x-6 sm:flex-row sm:flex-wrap">
              <li><ExternalLink c={c} href="https://bipad.gov.np">{c('limits.bipad')}</ExternalLink></li>
              <li><ExternalLink c={c} href="https://www.dhm.gov.np">{c('limits.dhm')}</ExternalLink></li>
            </ul>
          </div>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {c('limits.items').map((item) => (
              <li key={item} className="flex gap-3 py-3 text-sm leading-relaxed text-ink sm:text-base">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 size-4 shrink-0 text-marigold"><path d="M10 3 18 17H2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function Faq({ c }) {
  return (
    <Section id="faq" labelledBy="faq-title" tone="sunken">
      <div className="mx-auto max-w-3xl">
        <SectionHeading id="faq-title" eyebrow={c('faq.eyebrow')} title={c('faq.title')} align="center" />
        <div className="mt-10"><Accordion items={c('faq.items')} /></div>
      </div>
    </Section>
  )
}

function Footer({ c }) {
  const links = c('footer.links')
  const link = 'inline-flex min-h-10 items-center text-sm text-muted transition-colors hover:text-ink'
  return (
    <footer className="border-t border-line bg-surface">
      <div className={cx(CONTAINER, 'py-14 sm:py-16')}>
        <div className="flex flex-col gap-6 rounded-2xl border border-line bg-raised p-6 shadow-card sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">{c('footer.ctaTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{c('footer.ctaBody')}</p>
          </div>
          <div className="flex flex-col gap-2 min-[420px]:flex-row md:shrink-0">
            <ButtonLink href={portalHref('overview')}>{c('header.portal')} <Arrow /></ButtonLink>
            <ButtonLink href={portalHref('map')} variant="secondary">{c('header.openMap')}</ButtonLink>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <p className="flex items-center gap-2 text-lg font-semibold text-ink"><LogoMark className="size-7" /> BhuDrishti</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c('footer.tagline')}</p>
          </div>
          <nav aria-label="Portal shortcuts">
            <h3 className="text-sm font-semibold text-ink">{c('footer.portal')}</h3>
            <ul className="mt-2">
              {Object.entries(links).map(([id, label]) => <li key={id}><a className={link} href={portalHref(id)}>{label}</a></li>)}
            </ul>
          </nav>
          <nav aria-label="Landing sections">
            <h3 className="text-sm font-semibold text-ink">{c('footer.learn')}</h3>
            <ul className="mt-2">
              {SECTIONS.map((s) => <li key={s.id}><a className={link} href={`#${s.id}`}>{c(`nav.${s.key}`)}</a></li>)}
            </ul>
          </nav>
          <div className="col-span-2 lg:col-span-1">
            <h3 className="text-sm font-semibold text-ink">{c('footer.safety')}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">{c('footer.safetyBody')}</p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs leading-relaxed text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{c('footer.attribution')}</p>
          <a href="#home" className="inline-flex min-h-10 shrink-0 items-center font-medium text-ink hover:text-accent">{c('footer.top')} ↑</a>
        </div>
      </div>
    </footer>
  )
}

export default function HomePage({ section }) {
  const { lang } = useI18n()
  const c = useMemo(() => makeCopy(lang), [lang])

  useEffect(() => { document.title = c('meta.title') }, [c])
  useEffect(() => {
    if (!section) return undefined
    const target = SECTION_ALIASES[section] || section
    const t = setTimeout(() => focusTarget(target), 0)
    return () => clearTimeout(t)
  }, [section])

  return (
    <div id="home" className="min-h-screen bg-surface text-ink">
      <a href="#main" onClick={(e) => { e.preventDefault(); focusTarget('main') }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-raised focus:px-3 focus:py-2 focus:text-ink focus:shadow-card">{c('skip')}</a>
      <SiteHeader c={c} />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero c={c} lang={lang} />
        <HowItWorks c={c} />
        <Coverage c={c} />
        <Workflow c={c} />
        <LanguagesAgents c={c} lang={lang} />
        <Limitations c={c} />
        <Faq c={c} />
      </main>
      <Footer c={c} />
    </div>
  )
}
