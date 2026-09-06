import { useState } from 'react'
import { Chip, DangerBtn, Empty, Eyebrow, InlineText, NumCell, Page, Scroller, Section, Sheet, Tools, Track } from '../components/ui'
import { todayISO } from '../lib/dates'
import { macrosForDate } from '../lib/stats'
import { useStore } from '../store/store'

function TargetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const rows: { key: 'kcal' | 'protein' | 'carbs' | 'fat'; label: string; unit: string }[] = [
    { key: 'kcal', label: 'Calories', unit: '' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbs', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Targets">
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between border-b border-line py-3">
            <span className="text-body text-mute">{r.label}</span>
            <span className="flex items-baseline gap-2">
              <NumCell
                value={s.macros[r.key][0]}
                onChange={(v) => s.setMacros({ [r.key]: [v ?? 0, s.macros[r.key][1]] } as never)}
                ariaLabel={`${r.label} minimum`}
                width="w-14"
              />
              <span className="text-faint">–</span>
              <NumCell
                value={s.macros[r.key][1]}
                onChange={(v) => s.setMacros({ [r.key]: [s.macros[r.key][0], v ?? 0] } as never)}
                ariaLabel={`${r.label} maximum`}
                width="w-14"
                suffix={r.unit}
              />
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-b border-line py-3">
          <span className="text-body text-mute">Water</span>
          <NumCell value={s.macros.waterMl} onChange={(v) => s.setMacros({ waterMl: v ?? 0 })} ariaLabel="Water target in millilitres" width="w-16" suffix="ml" />
        </div>
      </div>
    </Sheet>
  )
}

export function Nutrition({ label }: { label: string }) {
  const s = useStore()
  const date = todayISO()
  const m = macrosForDate(s, date)
  const todayLogs = s.foodLogs.filter((f) => f.date === date)
  const [targets, setTargets] = useState(false)
  const [editWindows, setEditWindows] = useState(false)

  return (
    <Page
      title={label}
      lede="Protein is the anchor, carbs are the dial. Log fast, correct freely — nothing here is locked."
      actions={
        <button className="btn" onClick={() => setTargets(true)}>
          Targets
        </button>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="space-y-9">
          <Section label="Today">
            <Track label="Calories" value={m.kcal} min={s.macros.kcal[0]} max={s.macros.kcal[1]} onEditTarget={() => setTargets(true)} />
            <Track label="Protein" value={m.protein} min={s.macros.protein[0]} max={s.macros.protein[1]} unit="g" />
            <Track label="Carbs" value={m.carbs} min={s.macros.carbs[0]} max={s.macros.carbs[1]} unit="g" />
            <Track label="Fat" value={m.fat} min={s.macros.fat[0]} max={s.macros.fat[1]} unit="g" />

            <form
              className="mt-6 grid grid-cols-2 gap-2 border-t border-line pt-5 sm:grid-cols-6"
              onSubmit={(e) => {
                e.preventDefault()
                const f = e.currentTarget
                const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value
                const name = get('fname').trim()
                if (!name) return
                s.addFood({
                  date,
                  name,
                  kcal: parseInt(get('fkcal')) || 0,
                  protein: parseInt(get('fp')) || 0,
                  carbs: parseInt(get('fc')) || 0,
                  fat: parseInt(get('ff')) || 0,
                })
                f.reset()
              }}
            >
              <input name="fname" className="field col-span-2" placeholder="Meal or food" aria-label="Food name" />
              <input name="fkcal" className="field num" placeholder="kcal" inputMode="numeric" aria-label="Calories" />
              <input name="fp" className="field num" placeholder="P" inputMode="numeric" aria-label="Protein" />
              <input name="fc" className="field num" placeholder="C" inputMode="numeric" aria-label="Carbs" />
              <div className="flex gap-2">
                <input name="ff" className="field num min-w-0 flex-1" placeholder="F" inputMode="numeric" aria-label="Fat" />
                <button className="btn btn-solid" type="submit">
                  Log
                </button>
              </div>
            </form>

            {todayLogs.length ? (
              <ul className="mt-6">
                {todayLogs.map((f) => (
                  <li key={f.id} className="group flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <InlineText value={f.name} onChange={(v) => s.updateFood(f.id, { name: v })} ariaLabel="Food name" className="text-body text-paper" />
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2.5 text-micro text-faint">
                      <NumCell value={f.kcal} onChange={(v) => s.updateFood(f.id, { kcal: v ?? 0 })} ariaLabel="Calories" width="w-11" suffix="kcal" />
                      <NumCell value={f.protein} onChange={(v) => s.updateFood(f.id, { protein: v ?? 0 })} ariaLabel="Protein" width="w-8" suffix="p" />
                      <NumCell value={f.carbs} onChange={(v) => s.updateFood(f.id, { carbs: v ?? 0 })} ariaLabel="Carbs" width="w-8" suffix="c" />
                      <NumCell value={f.fat} onChange={(v) => s.updateFood(f.id, { fat: v ?? 0 })} ariaLabel="Fat" width="w-8" suffix="f" />
                    </span>
                    <Tools>
                      <DangerBtn onConfirm={() => s.removeFood(f.id)} label={`Delete ${f.name}`} />
                    </Tools>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4">
                <Empty>Nothing logged. Tell Jarvis “chicken rice bowl, 750 kcal, 55 protein”.</Empty>
              </div>
            )}
          </Section>

          <Section
            label="Meal rotation"
            aside={
              <button className="btn btn-sm" onClick={() => setEditWindows(!editWindows)}>
                {editWindows ? 'Done' : 'Edit windows'}
              </button>
            }
          >
            {editWindows && (
              <div className="mb-6 border-b border-line pb-5">
                <Scroller>
                  {s.mealWindows.map((w) => (
                    <span key={w.id} className="flex items-center gap-1 border border-line px-2 py-1">
                      <InlineText value={w.label} onChange={(v) => s.renameTaxon('mealWindows', w.id, v)} ariaLabel="Window name" className="w-24 text-micro" />
                      <DangerBtn onConfirm={() => s.removeTaxon('mealWindows', w.id)} label="Delete window" />
                    </span>
                  ))}
                  <Chip onClick={() => s.addTaxon('mealWindows', 'New window')}>+ Window</Chip>
                </Scroller>
              </div>
            )}
            <div className="space-y-7">
              {s.mealWindows.map((w) => (
                <div key={w.id}>
                  <Eyebrow className="mb-3">{w.label}</Eyebrow>
                  <ul>
                    {s.meals
                      .filter((meal) => meal.window === w.id)
                      .map((meal) => (
                        <li key={meal.id} className="group border-b border-line py-2.5 last:border-b-0">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <InlineText value={meal.name} onChange={(v) => s.updateMeal(meal.id, { name: v })} ariaLabel="Meal name" className="text-body text-paper" />
                              <InlineText
                                value={meal.detail}
                                onChange={(v) => s.updateMeal(meal.id, { detail: v })}
                                ariaLabel="Meal detail"
                                placeholder="Ingredients…"
                                className="mt-1 text-micro leading-relaxed text-faint"
                              />
                            </div>
                            <Tools>
                              <DangerBtn onConfirm={() => s.removeMeal(meal.id)} label="Delete meal" />
                            </Tools>
                          </div>
                        </li>
                      ))}
                  </ul>
                  <button className="btn btn-sm mt-3" onClick={() => s.addMeal({ window: w.id, name: 'New option', detail: '' })}>
                    + Option
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section label="Fuelling framework — carbs by day type">
            <p className="mb-5 max-w-2xl text-body text-faint">
              Protein holds at 1.8–2.2 g/kg. Carbohydrate is the dial you turn against the day's demand. Every value is
              editable — the 80 kg example recomputes itself, or just tell Jarvis.
            </p>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[560px] border-collapse text-body">
                <thead>
                  <tr>
                    {['Day type', 'Protein g/kg', 'Carbs g/kg', 'Fat g/kg', 'Example (80 kg)'].map((h) => (
                      <th key={h} className="border-b border-line-2 py-2.5 text-left">
                        <span className="eyebrow">{h}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.dayTypeMacros.map((d) => (
                    <tr key={d.code} className="border-b border-line">
                      <td className="py-1.5 text-paper">
                        <span className="num mr-2.5 text-micro text-faint">{d.code}</span>
                        <InlineText
                          value={d.label}
                          onChange={(v) => s.updateDayTypeMacro(d.code, { label: v })}
                          ariaLabel={`Name of day type ${d.code}`}
                        />
                      </td>
                      <td className="num py-1.5 text-mute">
                        <InlineText
                          value={d.proteinGkg}
                          onChange={(v) => s.updateDayTypeMacro(d.code, { proteinGkg: v })}
                          ariaLabel={`Protein g/kg for ${d.label}`}
                          className="w-16"
                          mono
                        />
                      </td>
                      <td className="num py-1.5 text-paper">
                        <InlineText
                          value={d.carbGkg}
                          onChange={(v) => s.updateDayTypeMacro(d.code, { carbGkg: v })}
                          ariaLabel={`Carbs g/kg for ${d.label}`}
                          className="w-16"
                          mono
                        />
                      </td>
                      <td className="num py-1.5 text-mute">
                        <InlineText
                          value={d.fatGkg}
                          onChange={(v) => s.updateDayTypeMacro(d.code, { fatGkg: v })}
                          ariaLabel={`Fat g/kg for ${d.label}`}
                          className="w-16"
                          mono
                        />
                      </td>
                      <td className="num py-1.5 text-faint">{d.example80kg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="space-y-9 lg:sticky lg:top-8 lg:self-start">
          <Section label="Hydration">
            <div className="flex items-baseline justify-between">
              <span className="readout text-[2.5rem]">{(m.water / 1000).toFixed(1)}</span>
              <span className="num text-body text-faint">/ {(s.macros.waterMl / 1000).toFixed(1)}L</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[250, 500, 750].map((ml) => (
                <button key={ml} className="btn" onClick={() => s.addWater(date, ml)}>
                  +{ml}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button className="btn btn-quiet" onClick={() => s.addWater(date, -250)} disabled={m.water <= 0}>
                −250
              </button>
              <button className="btn btn-quiet" onClick={() => s.addWater(date, -500)} disabled={m.water <= 0}>
                −500
              </button>
              <button className="btn btn-quiet" onClick={() => s.setWater(date, 0)} disabled={m.water <= 0}>
                Reset
              </button>
            </div>
          </Section>
        </div>
      </div>

      <TargetSheet open={targets} onClose={() => setTargets(false)} />
    </Page>
  )
}
