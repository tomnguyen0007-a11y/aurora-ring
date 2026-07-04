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
  { id: 'schedule', label: 'Schedule', icon: CalendarRange },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

const MOBILE_PRIMARY: ViewId[] = ['today', 'golf', 'jarvis', 'training', 'nutrition']

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="relative flex h-9 w-9 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-9 w-9">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#2a3140" strokeWidth="2.5" />
          <path d="M 18 4 A 14 14 0 1 1 5.9 11" fill="none" stroke="#f6b83c" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="18" cy="18" r="3" fill="#f6b83c" />
        </svg>
      </div>
      <div>
        <div className="h-lumen text-lg font-bold leading-none tracking-[0.2em]">CALIBRATE</div>
        <div className="hud-label !mb-0 mt-1 !text-[8px] !tracking-[0.3em] text-arc">PERSONAL OS</div>
      </div>
    </div>
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
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-signal shadow-[0_0_10px_rgba(246,184,60,0.7)]" />
                )}
                <Icon size={17} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                {label}
              </button>
            )
          })}
        </nav>
        <div className="px-3 pt-3 text-[10px] leading-relaxed text-fog">
          <span className="text-signal-dim">◆</span> THE BLUEPRINT V5
          <br />
          Executive Operating System
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
        {/* Mobile top bar */}
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <Brand />
          <button className="btn btn-ghost !px-2.5" aria-label="Settings" onClick={() => go('settings')}>
            <Settings2 size={18} />
          </button>
        </div>
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary mobile"
        className="glass-strong fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl px-1 py-1.5 lg:hidden"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        {MOBILE_PRIMARY.map((id) => {
          const item = NAV.find((x) => x.id === id)!
          const Icon = item.icon
          const active = view === id
          const isJarvis = id === 'jarvis'
          return (
            <button
              key={id}
              onClick={() => go(id)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-all ${
                isJarvis
                  ? 'relative -mt-6 rounded-full border border-signal/50 bg-gradient-to-b from-[#f6b83c] to-[#dd9224] p-3.5 text-[#141004] shadow-[0_8px_24px_-6px_rgba(246,184,60,0.6)]'
                  : active
                    ? 'text-signal'
                    : 'text-fog'
              }`}
            >
              <Icon size={isJarvis ? 22 : 19} strokeWidth={active || isJarvis ? 2.4 : 2} />
              {!isJarvis && <span className="font-display text-[9px] font-semibold tracking-wider">{item.label}</span>}
            </button>
          )
        })}
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="More sections"
          className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-fog"
        >
          <MoreHorizontal size={19} />
          <span className="font-display text-[9px] font-semibold tracking-wider">More</span>
        </button>
      </nav>

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="glass-strong w-full rounded-t-3xl p-5 pb-8 animate-rise"
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
                  className={`flex flex-col items-center gap-2 rounded-xl border border-edge px-2 py-3.5 transition-colors ${
                    view === id ? 'bg-signal/10 text-signal' : 'bg-black/20 text-haze active:bg-white/5'
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
