import { Droplets, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Empty, HudLabel, Meter, Panel } from '../components/ui'
import { todayISO } from '../lib/dates'
import { macrosForDate } from '../lib/stats'
import { useStore } from '../store/store'

export function Nutrition() {
  const s = useStore()
  const date = todayISO()
  const m = macrosForDate(s, date)
  const todayLogs = s.foodLogs.filter((f) => f.date === date)

  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  const windows = ['Breakfast', 'Lunch', 'Dinner', 'Performance Snack']

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-bold tracking-wide text-ice">FUEL ARCHITECTURE</h1>
        <p className="mt-1 text-sm text-haze">Food is direct fuel for lean hypertrophy and cognitive output. Lean bulk framework.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <HudLabel>Today's Intake</HudLabel>
          <div className="space-y-3.5">
            <Meter label="Calories" value={m.kcal} min={s.macros.kcal[0]} max={s.macros.kcal[1]} />
            <Meter label="Protein" value={m.protein} min={s.macros.protein[0]} max={s.macros.protein[1]} unit="g" color="var(--color-steel)" />
            <Meter label="Carbs" value={m.carbs} min={s.macros.carbs[0]} max={s.macros.carbs[1]} unit="g" color="#c9a3d4" />
            <Meter label="Fat" value={m.fat} min={s.macros.fat[0]} max={s.macros.fat[1]} unit="g" color="#e0a458" />
          </div>

          <form
            className="mt-5 grid grid-cols-2 gap-2 border-t border-edge pt-4 sm:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              s.addFood({
                date,
                name: name.trim(),
                kcal: parseInt(kcal) || 0,
                protein: parseInt(protein) || 0,
                carbs: parseInt(carbs) || 0,
                fat: parseInt(fat) || 0,
              })
              setName(''); setKcal(''); setProtein(''); setCarbs(''); setFat('')
            }}
          >
            <input className="field col-span-2 sm:col-span-2" placeholder="Meal / food" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="field num" placeholder="kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
            <input className="field num" placeholder="P g" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
            <input className="field num" placeholder="C g" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            <div className="flex gap-2">
              <input className="field num flex-1" placeholder="F g" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} />
              <button className="btn btn-signal !px-3" type="submit" aria-label="Log food">
                <Plus size={15} />
              </button>
            </div>
          </form>

          {todayLogs.length ? (
            <ul className="mt-4 space-y-1.5">
              {todayLogs.map((f) => (
                <li key={f.id} className="group flex items-center justify-between gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ice">{f.name}</span>
                  <span className="num shrink-0 text-xs text-fog">
                    {f.kcal}kcal · {f.protein}P {f.carbs}C {f.fat}F
                  </span>
                  <button className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Delete ${f.name}`} onClick={() => s.removeFood(f.id)}>
                    <Trash2 size={14} className="text-alert/70" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <Empty>Nothing logged today. Tell Jarvis: “log chicken rice bowl, 750 kcal, 55 protein”.</Empty>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <HudLabel>
              <Droplets size={11} className="text-steel" /> Hydration
            </HudLabel>
            <div className="flex items-baseline justify-between">
              <span className="num text-3xl font-bold text-steel">{(m.water / 1000).toFixed(1)}L</span>
              <span className="num text-xs text-fog">target {(s.macros.waterMl / 1000).toFixed(0)}L</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-steel transition-all duration-500"
                style={{ width: `${Math.min(100, (m.water / s.macros.waterMl) * 100)}%`, boxShadow: '0 0 10px rgba(127,180,216,0.5)' }}
              />
            </div>
            <div className="mt-3 flex gap-2">
              {[250, 500, 750].map((ml) => (
                <button key={ml} className="btn flex-1 !py-1.5 !text-xs" onClick={() => s.addWater(date, ml)}>
                  +{ml}ml
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <HudLabel>Meal Rotation Matrix</HudLabel>
            <div className="space-y-3">
              {windows.map((w) => (
                <div key={w}>
                  <div className="hud-label !mb-1.5 !text-[8px] text-signal-dim">{w}</div>
                  {s.meals
                    .filter((meal) => meal.window === w)
                    .map((meal) => (
                      <div key={meal.id} className="mb-1.5 rounded-lg bg-black/25 px-3 py-2">
                        <div className="text-sm font-medium text-ice">{meal.name}</div>
                        <div className="text-[11px] leading-snug text-fog">{meal.detail}</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
