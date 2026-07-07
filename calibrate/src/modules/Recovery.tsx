import { Coffee, Droplets, Moon, Pill, Plus, Trash2, Wine } from 'lucide-react'
import { CheckDot, HudLabel, Panel, StatTile } from '../components/ui'
import { todayISO } from '../lib/dates'
import { streaks } from '../lib/stats'
import { useStore } from '../store/store'

const GUIDE = [
  {
    icon: Coffee,
    color: '#ff7e47',
    title: 'Caffeine',
    lines: [
      '3–6 mg/kg ~60 min pre key session (≤400mg/day).',
      'Half-life 6–8h — cut by midday to protect sleep.',
      'Save it for quality/long runs + hard gym days.',
    ],
  },
  {
    icon: Wine,
    color: '#c9a3d4',
    title: 'Alcohol',
    lines: [
      'Biggest hit is recovery + sleep quality.',
      'Never before key sessions. If social: ≤2 drinks.',
      'Hydrate + electrolytes, vodka soda, precede a rest day.',
    ],
  },
  {
    icon: Moon,
    color: '#7f8fd8',
    title: 'Sleep',
    lines: [
      'Strict 22:30 blackout → 06:30 wake = 8h.',
      'Screens off, magnesium, wind-down ritual.',
      'Sleep is where adaptation actually happens.',
    ],
  },
]

export function Recovery() {
  const s = useStore()
  const date = todayISO()
  const taken = s.supLog[date] ?? {}
  const doneCount = s.supplements.filter((x) => taken[x.id]).length
  const st = streaks(s)
  const water = s.water[date] ?? 0

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="h-lumen text-3xl font-bold tracking-wide">RECOVERY</h1>
        <p className="mt-1 text-sm text-haze">The third training session. Hydration, supplements, and the levers that protect adaptation — from Ollie's Recovery Blueprint.</p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Supplements" value={`${doneCount}/${s.supplements.length}`} sub="taken today" accent={doneCount === s.supplements.length ? 'text-affirm' : 'text-ice'} />
        <StatTile label="Water" value={`${(water / 1000).toFixed(1)}L`} sub="of 3L target" accent="text-arc" />
        <StatTile label="Blackout" value={st.blackout} sub="day streak" accent="text-signal" />
        <StatTile label="Check-in" value={st.checkin} sub="day streak" accent="text-steel" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Supplement stack */}
        <Panel className="lg:col-span-2">
          <HudLabel>
            <Pill size={11} className="text-affirm" /> Daily Supplement Stack
          </HudLabel>
          <ul className="space-y-1.5">
            {s.supplements.map((sup) => {
              const on = !!taken[sup.id]
              return (
                <li key={sup.id} className="group flex items-center gap-3 rounded-xl bg-black/25 px-3.5 py-2.5">
                  <CheckDot checked={on} onToggle={() => s.toggleSupplement(date, sup.id)} label={sup.name} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${on ? 'text-fog line-through' : 'text-ice'}`}>{sup.name}</div>
                    <div className="text-[11px] text-fog">
                      {sup.dose} · {sup.timing}
                    </div>
                  </div>
                  <button
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Remove ${sup.name}`}
                    onClick={() => s.removeSupplement(sup.id)}
                  >
                    <Trash2 size={14} className="text-alert/70" />
                  </button>
                </li>
              )
            })}
          </ul>
          <SupplementAdder />
        </Panel>

        {/* Hydration protocol */}
        <Panel>
          <HudLabel>
            <Droplets size={11} className="text-arc" /> Hydration Protocol
          </HudLabel>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="num text-3xl font-bold text-arc text-glow-arc">{(water / 1000).toFixed(1)}L</span>
            <span className="num text-xs text-fog">/ 3L+ target</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-arc transition-all duration-500"
              style={{ width: `${Math.min(100, (water / s.macros.waterMl) * 100)}%`, boxShadow: '0 0 10px rgba(88,199,240,0.5)' }}
            />
          </div>
          <div className="mb-3 flex gap-2">
            {[250, 500, 750].map((ml) => (
              <button key={ml} className="btn flex-1 !py-1.5 !text-xs" onClick={() => s.addWater(date, ml)}>
                +{ml}
              </button>
            ))}
          </div>
          <ul className="space-y-1 text-xs text-haze">
            <li>· Front-load early — 1L on waking + electrolytes</li>
            <li>· 500–1000mg sodium AM; again if training</li>
            <li>· ~0.4–0.8 L/h during training</li>
            <li>· Cut fluids 1–2h before bed</li>
          </ul>
        </Panel>

        {/* Levers */}
        {GUIDE.map((g) => {
          const Icon = g.icon
          return (
            <Panel key={g.title}>
              <HudLabel>
                <Icon size={11} style={{ color: g.color }} /> {g.title}
              </HudLabel>
              <ul className="space-y-1.5 text-sm text-haze">
                {g.lines.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span style={{ color: g.color }}>·</span> {l}
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

function SupplementAdder() {
  const s = useStore()
  return (
    <form
      className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget as HTMLFormElement
        const name = (form.elements.namedItem('sname') as HTMLInputElement).value.trim()
        const dose = (form.elements.namedItem('sdose') as HTMLInputElement).value.trim()
        const timing = (form.elements.namedItem('stime') as HTMLInputElement).value.trim()
        if (!name) return
        s.addSupplement(name, dose || '—', timing || 'daily')
        form.reset()
      }}
    >
      <input name="sname" className="field min-w-0 flex-1" placeholder="Supplement" aria-label="Supplement name" />
      <input name="sdose" className="field w-24" placeholder="Dose" aria-label="Dose" />
      <input name="stime" className="field w-28" placeholder="Timing" aria-label="Timing" />
      <button className="btn btn-signal !px-3" type="submit" aria-label="Add supplement">
        <Plus size={15} />
      </button>
    </form>
  )
}
