import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { setPendingAsk } from '../lib/ask'
import { getSyncStatus, subscribeSyncStatus } from '../lib/supabase'
import { useStore } from '../store/store'
import type { SectionDef } from '../store/types'
import { Icon, Mark, type GlyphName } from './icons'
import { Palette } from './Palette'
import { Eyebrow, IconBtn, InlineText, Sheet } from './ui'

/** Clear the offline cache and reload — the "why is this stale" escape hatch. */
async function hardRefresh() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    location.reload()
  }
}

/** The mark is yours: drop any SVG/PNG in Settings → Brand and it lands here,
    in the mobile bar and in the browser tab. Falls back to the default wing. */
export function BrandMark({ size = 13, className = '' }: { size?: number; className?: string }) {
  const mark = useStore((s) => s.settings.brandMark)
  const invert = useStore((s) => s.settings.brandInvert)
  if (!mark) return <Mark size={size} className={className} />
  return (
    <img
      src={mark}
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className}`}
      style={{ height: size * 1.5, width: 'auto', maxWidth: size * 3, filter: invert ? 'invert(1)' : undefined }}
    />
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  const name = useStore((s) => s.settings.brandName) || 'CALIBRATE'
  const tagline = useStore((s) => s.settings.brandTagline) ?? 'PERSONAL OS'
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={13} className="text-paper" />
      <div className="leading-none">
        <div className="text-[0.8125rem] font-medium tracking-[0.16em] text-paper">{name}</div>
        {!compact && tagline && <div className="mt-1 text-[0.5625rem] tracking-[0.18em] text-faint">{tagline}</div>}
      </div>
    </div>
  )
}

/** Sync state as a single hairline square. Nothing blinks, nothing is coloured. */
function SyncMark() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const setView = useStore((s) => s.setView)
  const label = !status.enabled
    ? 'Local only — tap to set up sync'
    : status.error
      ? `Sync error: ${status.error}`
      : status.pendingPush
        ? 'Syncing…'
        : 'Synced'
  const text = !status.enabled ? 'LOCAL' : status.error ? 'ERROR' : status.pendingPush ? 'SYNC…' : 'SYNCED'
  return (
    <button onClick={() => setView('settings')} title={label} aria-label={label} className="flex items-center gap-2">
      <span
        className={`block h-1.5 w-1.5 ${
          !status.enabled ? 'bg-ghost' : status.error ? 'bg-paper/40' : status.pendingPush ? 'animate-breathe bg-paper' : 'bg-paper'
        }`}
      />
      <span className="eyebrow">{text}</span>
    </button>
  )
}

/** The grouped index — the full map of the app, on both viewports. */
function IndexSheet({ open, onClose, go }: { open: boolean; onClose: () => void; go: (id: string) => void }) {
  const sections = useStore((s) => s.sections)
  const groups = useStore((s) => s.groups)
  const view = useStore((s) => s.view)
  const updateSection = useStore((s) => s.updateSection)
  const [q, setQ] = useState('')
  // Arrange mode turns the index into the section manager: rename, show/hide,
  // pin to the bottom bar. It lives here because this is where you go looking.
  const [arrange, setArrange] = useState(false)

  const grouped = useMemo(() => {
    const visible = sections.filter((s) => (arrange || !s.hidden) && (!q || s.label.toLowerCase().includes(q.toLowerCase())))
    return [...groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ group: g, items: visible.filter((s) => s.group === g.id).sort((a, b) => a.order - b.order) }))
      .filter((x) => x.items.length)
  }, [sections, groups, q, arrange])

  return (
    <Sheet open={open} onClose={onClose} title="Index">
      <div className="mb-5 flex items-center gap-2">
        <input
          className="field min-w-0 flex-1"
          placeholder="Filter sections…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter sections"
        />
        <button className="btn btn-sm shrink-0" onClick={() => setArrange(!arrange)}>
          {arrange ? 'Done' : 'Arrange'}
        </button>
      </div>
      {arrange && (
        <p className="mb-5 text-micro leading-relaxed text-faint">
          Rename anything. The eye hides a section from the app; the pin puts it on the bottom bar (first four win).
        </p>
      )}
      <div className="space-y-6">
        {grouped.map(({ group, items }) => (
          <div key={group.id}>
            <Eyebrow className="mb-2">{group.label}</Eyebrow>
            <div className="border-t border-line">
              {items.map((sec) =>
                arrange ? (
                  <div
                    key={sec.id}
                    className={`flex w-full items-center gap-3 border-b border-line py-2.5 ${sec.hidden ? 'opacity-45' : ''}`}
                  >
                    <Icon name={(sec.icon as GlyphName) ?? 'custom'} size={15} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <InlineText
                        value={sec.label}
                        onChange={(v) => updateSection(sec.id, { label: v })}
                        ariaLabel={`Rename ${sec.label}`}
                        className="w-full text-body text-paper"
                      />
                    </span>
                    <IconBtn
                      glyph={sec.hidden ? 'eye' : 'check'}
                      label={sec.hidden ? `Show ${sec.label}` : `Hide ${sec.label}`}
                      active={!sec.hidden}
                      onClick={() => updateSection(sec.id, { hidden: !sec.hidden })}
                    />
                    <IconBtn
                      glyph="pin"
                      label={sec.bar ? `Unpin ${sec.label}` : `Pin ${sec.label} to the bar`}
                      active={!!sec.bar}
                      onClick={() => updateSection(sec.id, { bar: !sec.bar })}
                    />
                  </div>
                ) : (
                  <button
                    key={sec.id}
                    onClick={() => {
                      go(sec.id)
                      onClose()
                    }}
                    className={`flex w-full items-center gap-3 border-b border-line py-3 text-left text-body ${
                      view === sec.id ? 'text-paper' : 'text-mute'
                    }`}
                  >
                    <Icon name={(sec.icon as GlyphName) ?? 'custom'} size={15} className={view === sec.id ? 'text-paper' : 'text-faint'} />
                    <span className="flex-1 truncate">{sec.label}</span>
                    {view === sec.id && <span className="h-1 w-1 bg-paper" />}
                  </button>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-7 flex flex-wrap gap-2 border-t border-line pt-5">
        <button
          className="btn"
          onClick={() => {
            go('settings')
            onClose()
          }}
        >
          <Icon name="sliders" size={13} /> Customise navigation
        </button>
        <button className="btn" onClick={hardRefresh}>
          <Icon name="refresh" size={13} /> Reload app
        </button>
      </div>
    </Sheet>
  )
}

export function Shell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const sections = useStore((s) => s.sections)
  const groups = useStore((s) => s.groups)
  const [indexOpen, setIndexOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const go = (id: string) => {
    setView(id)
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nav = useMemo(
    () =>
      [...groups]
        .sort((a, b) => a.order - b.order)
        .map((g) => ({
          group: g,
          items: sections.filter((s) => s.group === g.id && !s.hidden).sort((a, b) => a.order - b.order),
        }))
        .filter((x) => x.items.length),
    [sections, groups],
  )

  const current = sections.find((s) => s.id === view)

  // Mobile bar: whatever is pinned, capped at four, with Jarvis always centre.
  const barItems: SectionDef[] = useMemo(() => {
    const pinned = sections.filter((s) => s.bar && !s.hidden && s.module !== 'jarvis').sort((a, b) => a.order - b.order)
    return pinned.slice(0, 4)
  }, [sections])
  const jarvis = sections.find((s) => s.module === 'jarvis' && !s.hidden)
  const left = barItems.slice(0, 2)
  const right = barItems.slice(2, 4)

  // Sidebar overflows below ~900px tall. Fade the tail only while there is more to reach.
  const navRef = useRef<HTMLElement | null>(null)
  const [navFade, setNavFade] = useState(false)
  const onNavScroll = useCallback(() => {
    const el = navRef.current
    if (!el) return
    setNavFade(el.scrollHeight - el.clientHeight - el.scrollTop > 4)
  }, [])
  useLayoutEffect(onNavScroll, [onNavScroll, nav])
  useEffect(() => {
    const el = navRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(onNavScroll)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onNavScroll])

  return (
    /* The whole app is one non-scrolling flex box; only <main> scrolls.
       Nothing here is position:fixed, which is the point: iOS repaints fixed
       elements against a stale viewport during momentum scroll, which is how
       the bottom bar ended up floating mid-screen. A normal flex child cannot
       detach. */
    <div className="mx-auto flex h-dvh max-w-[1440px] overflow-hidden">
      {/* ── Desktop sidebar: typography only. No icons, no boxes. ── */}
      <aside className="hidden h-full w-[212px] shrink-0 flex-col border-r border-line px-6 py-7 lg:flex">
        <button onClick={() => go('today')} className="mb-7 text-left" aria-label="Calibrate home">
          <Brand />
        </button>

        <nav
          ref={navRef}
          onScroll={onNavScroll}
          className="no-bar flex-1 overflow-y-auto"
          aria-label="Sections"
          style={
            navFade
              ? { maskImage: 'linear-gradient(to bottom,#000 calc(100% - 32px),transparent)', WebkitMaskImage: 'linear-gradient(to bottom,#000 calc(100% - 32px),transparent)' }
              : undefined
          }
        >
          {nav.map(({ group, items }, gi) => (
            <div key={group.id} className={gi === 0 ? '' : 'mt-6'}>
              <Eyebrow className="mb-2">{group.label}</Eyebrow>
              <div className="-ml-6 space-y-px">
                {items.map((s) => {
                  const active = view === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => go(s.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative block w-full py-[5px] pl-6 pr-2 text-left text-body transition-colors ${
                        active ? 'text-paper' : 'text-dim hover:text-mute'
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-3.5 w-px -translate-y-1/2 bg-paper" />}
                      <span className="truncate">{s.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-5 space-y-2.5 border-t border-line pt-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center justify-between text-left text-micro text-faint transition-colors hover:text-mute"
          >
            <span className="flex items-center gap-2">
              <Icon name="search" size={12} /> Search or ask
            </span>
            <span className="num text-[0.625rem] tracking-normal">⌘K</span>
          </button>
          <SyncMark />
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5 lg:hidden"
          style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}
        >
          <Brand compact />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Search or ask"
              className="p-2 text-faint transition-colors active:text-paper"
            >
              <Icon name="search" size={17} />
            </button>
            <button
              onClick={() => go('settings')}
              aria-label="Settings"
              className="p-2 text-faint transition-colors active:text-paper"
            >
              <Icon name="settings" size={17} />
            </button>
          </div>
        </div>

        <main className="no-bar min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-12 pt-7 sm:px-8 lg:px-10 lg:pb-10 lg:pt-9">
          {children}
        </main>

        {footer}

        {/* Bottom bar — a flex child, never fixed. See the note on the root. */}
        <nav
          aria-label="Primary"
          className="grid shrink-0 grid-cols-5 border-t border-line lg:hidden"
          style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
        >
          {[...left, jarvis, ...right].filter(Boolean).slice(0, 4).map((s) => (
            <BarTab key={s!.id} section={s!} active={view === s!.id} onClick={() => go(s!.id)} />
          ))}
          <button
            onClick={() => setIndexOpen(true)}
            aria-label="All sections"
            className="relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-faint transition-colors active:text-paper"
          >
            <Icon name="more" size={18} />
            <span className="text-[0.5625rem] tracking-[0.06em]">Index</span>
          </button>
        </nav>
      </div>


      <IndexSheet open={indexOpen} onClose={() => setIndexOpen(false)} go={go} />
      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAsk={(t) => {
          // Jarvis is code-split: park the question and let the module answer it on mount.
          setPendingAsk(t)
          const j = sections.find((s) => s.module === 'jarvis')
          if (j) go(j.id)
        }}
      />

      {/* Screen-reader anchor for the current page name */}
      <span className="sr-only" aria-live="polite">
        {current?.label}
      </span>
    </div>
  )
}

function BarTab({ section, active, onClick }: { section: SectionDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={section.label}
      className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 transition-colors ${
        active ? 'text-paper' : 'text-faint'
      }`}
    >
      {active && <span className="absolute inset-x-4 top-0 h-px bg-paper" />}
      <Icon name={(section.icon as GlyphName) ?? 'custom'} size={18} strokeWidth={active ? 1.5 : 1.25} />
      <span className="max-w-full truncate px-1 text-[0.5625rem] tracking-[0.06em]">{section.label}</span>
    </button>
  )
}
