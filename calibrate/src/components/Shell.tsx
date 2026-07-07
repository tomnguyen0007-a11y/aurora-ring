import {
  Activity,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  CalendarRange,
  CandlestickChart,
  Crosshair,
  Dumbbell,
  Globe,
  HeartPulse,
  LayoutGrid,
  MoreHorizontal,
  Settings2,
  ShoppingCart,
  StickyNote,
  Target,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useStore } from '../store/store'
import type { ViewId } from '../store/types'

const NAV: { id: ViewId; label: string; icon: typeof Activity }[] = [
  { id: 'today', label: 'Today', icon: LayoutGrid },
  { id: 'jarvis', label: 'Jarvis', icon: Bot },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'training', label: 'Training', icon: Dumbbell },
  { id: 'golf', label: 'Golf', icon: Crosshair },
  { id: 'nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { id: 'recovery', label: 'Recovery', icon: HeartPulse },
  { id: 'grocery', label: 'Grocery', icon: ShoppingCart },
  { id: 'business', label: 'AURORA', icon: Briefcase },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'mindset', label: 'Mindset', icon: Brain },
  { id: 'markets', label: 'Markets', icon: CandlestickChart },
  { id: 'news', label: 'News', icon: Globe },
  { id: 'schedule', label: 'Schedule', icon: CalendarRange },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

// 5 symmetric slots so Jarvis sits dead-center: 2 tabs, Jarvis, then Training + "More".
// Nutrition drops off the primary row but stays reachable via the More sheet / desktop sidebar.
const MOBILE_LEFT: ViewId[] = ['today', 'golf']
const MOBILE_RIGHT: ViewId[] = ['training']

/** Tap the wordmark to force-refresh the app: clears the offline cache and reloads. */
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

function Brand() {
  return (
    <button
      onClick={hardRefresh}
      title="Tap to refresh the app to the latest version"
      aria-label="Refresh Calibrate"
      className="flex items-center gap-3 px-2 text-left transition-opacity active:opacity-60"
    >
      <div className="relative flex h-9 w-9 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-9 w-9">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
          <path d="M 18 4 A 14 14 0 1 1 5.9 11" fill="none" stroke="#e9edf2" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="18" cy="18" r="3" fill="#e9edf2" />
        </svg>
      </div>
      <div>
        <div className="h-lumen text-lg font-bold leading-none tracking-[0.2em]">CALIBRATE</div>
        <div className="hud-label !mb-0 mt-1 !text-[8px] !tracking-[0.3em] text-arc">PERSONAL OS</div>
      </div>
    </button>
  )
}

/** Regular (non-Jarvis) bottom-nav tab — near-white glow when active, matching the ice/glass palette. */
function NavTab({ item, active, onClick }: { item: (typeof NAV)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-self-center gap-0.5 rounded-xl px-3 py-1.5 transition-all ${
        active ? 'text-ice drop-shadow-[0_0_8px_rgba(234,244,255,0.65)]' : 'text-fog'
      }`}
    >
      <Icon size={19} strokeWidth={active ? 2.4 : 2} />
      <span className="font-display text-[9px] font-semibold tracking-wider">{item.label}</span>
    </button>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const [moreOpen, setMoreOpen] = useState(false)

  const go = (v: ViewId) => {
    setView(v)
    setMoreOpen(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1500px]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-edge px-3 py-6 lg:flex">
        <div className="mb-8">
          <Brand />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Primary">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = view === id
            return (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-display text-[0.95rem] font-semibold tracking-wide transition-all ${
                  active ? 'bg-white/[0.06] text-signal' : 'text-haze hover:bg-white/[0.04] hover:text-ice'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-signal shadow-[0_0_10px_rgba(233,237,242,0.55)]" />
                )}
                <Icon size={17} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                {label}
              </button>
            )
          })}
        </nav>
        <div className="px-3 pt-3 text-[10px] leading-relaxed text-fog">
          <span className="text-signal-dim">◆</span> THE BLUEPRINT V6
          <br />
          Executive Operating System
        </div>
      </aside>

      {/* Main */}
      <main
        className="min-w-0 flex-1 px-3 pb-32 sm:px-6 lg:pb-10 lg:pt-6"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        {/* Mobile top bar */}
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <Brand />
          <button className="btn btn-ghost !px-2.5" aria-label="Settings" onClick={() => go('settings')}>
            <Settings2 size={18} />
          </button>
        </div>
        {children}
      </main>

      {/* Mobile bottom nav — 5 equal columns, Jarvis dead-center, monochrome ice glow */}
      <nav
        aria-label="Primary mobile"
        className="glass-strong fixed inset-x-3 z-40 grid grid-cols-5 items-center rounded-2xl px-1 py-2 lg:hidden"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {MOBILE_LEFT.map((id) => (
          <NavTab key={id} item={NAV.find((x) => x.id === id)!} active={view === id} onClick={() => go(id)} />
        ))}

        <button
          onClick={() => go('jarvis')}
          aria-label="Jarvis"
          aria-current={view === 'jarvis' ? 'page' : undefined}
          className="relative -mt-7 flex flex-col items-center justify-self-center"
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${
              view === 'jarvis'
                ? 'border-ice/40 bg-gradient-to-b from-[#2a2f38] to-[#05070a] text-ice shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_28px_rgba(234,244,255,0.55),0_10px_26px_-10px_rgba(0,0,0,0.9)]'
                : 'border-white/15 bg-gradient-to-b from-[#20242c] to-[#08090d] text-haze shadow-[0_0_16px_rgba(234,244,255,0.18),0_10px_22px_-10px_rgba(0,0,0,0.85)]'
            }`}
          >
            <Bot size={23} strokeWidth={2.2} />
          </span>
        </button>

        {MOBILE_RIGHT.map((id) => (
          <NavTab key={id} item={NAV.find((x) => x.id === id)!} active={view === id} onClick={() => go(id)} />
        ))}

        <button
          onClick={() => setMoreOpen(true)}
          aria-label="More sections"
          className="flex flex-col items-center justify-self-center gap-0.5 rounded-xl px-3 py-1.5 text-fog"
        >
          <MoreHorizontal size={19} />
          <span className="font-display text-[9px] font-semibold tracking-wider">More</span>
        </button>
      </nav>

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="glass-strong w-full rounded-t-3xl p-5 animate-rise"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="All sections"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="hud-label !mb-0">All Sections</span>
              <button className="btn btn-ghost !px-2" aria-label="Close" onClick={() => setMoreOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {NAV.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3.5 transition-colors ${
                    view === id
                      ? 'border-white/20 bg-white/[0.06] text-ice shadow-[0_0_14px_rgba(234,244,255,0.25)]'
                      : 'border-edge bg-black/20 text-haze active:bg-white/5'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-display text-[11px] font-semibold tracking-wide">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
