import { Bar, Chain, DangerBtn, Dot, Empty, Eyebrow, InlineText, Page, Reorder, Section, Tools } from '../components/ui'
import { todayISO } from '../lib/dates'
import { habitChain, habitStreak } from '../lib/habits'
import { useStore } from '../store/store'

const PROTOCOLS = [
  {
    title: 'Caffeine',
    lines: [
      '3–6 mg/kg about 60 minutes before a key session, 400 mg ceiling.',
      'Six to eight hour half-life — cut it by midday or it costs you sleep.',
      'Save it for quality runs and hard lifts. Daily use spends the effect.',
    ],
  },
  {
    title: 'Alcohol',
    lines: [
      'The real damage is recovery and sleep architecture, not the calories.',
      'Never the night before a key session. Social: two, hydrated, electrolytes.',
      'Put it in front of an easy or rest day, never a long run.',
    ],
  },
  {
    title: 'Sleep',
    lines: [
      '22:30 blackout to 06:30 wake. Eight hours is the floor, not the goal.',
      'Screens down, magnesium, and the same wind-down every night.',
      'Adaptation happens here. Training is only the stimulus.',
    ],
  },
]

export function Recovery({ label }: { label: string }) {
  const s = useStore()
  const date = todayISO()
  const taken = s.supLog[date] ?? {}
  const doneCount = s.supplements.filter((x) => taken[x.id]).length
  const water = s.water[date] ?? 0
  const blackout = s.habits.find((h) => h.id === 'h-blackout')

  return (
    <Page title={label} lede="The third training session. Hydration, the stack, and the levers that protect adaptation.">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="space-y-9">
          <Section label={`Daily stack · ${doneCount}/${s.supplements.length}`}>
            {s.supplements.length ? (
              <ul>
                {s.supplements.map((sup, i) => {
                  const on = !!taken[sup.id]
                  return (
                    <li key={sup.id} className="group flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                      <Dot checked={on} onToggle={() => s.toggleSupplement(date, sup.id)} label={sup.name} size={16} />
                      <div className="min-w-0 flex-1">
                        <InlineText
                          value={sup.name}
                          onChange={(v) => s.updateSupplement(sup.id, { name: v })}
                          ariaLabel="Supplement name"
                          className={`text-body ${on ? 'text-faint line-through' : 'text-paper'}`}
                        />
                      </div>
                      <span className="w-24 shrink-0">
                        <InlineText value={sup.dose} onChange={(v) => s.updateSupplement(sup.id, { dose: v })} ariaLabel="Dose" placeholder="dose" className="text-micro text-faint" />
                      </span>
                      <span className="hidden w-32 shrink-0 sm:block">
                        <InlineText value={sup.timing} onChange={(v) => s.updateSupplement(sup.id, { timing: v })} ariaLabel="Timing" placeholder="timing" className="text-micro text-faint" />
                      </span>
                      <Tools>
                        <Reorder
                          onUp={() => s.moveSupplement(sup.id, i - 1)}
                          onDown={() => s.moveSupplement(sup.id, i + 1)}
                          first={i === 0}
                          last={i === s.supplements.length - 1}
                        />
                        <DangerBtn onConfirm={() => s.removeSupplement(sup.id)} label={`Remove ${sup.name}`} />
                      </Tools>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>Stack is empty.</Empty>
            )}

            <form
              className="mt-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const f = e.currentTarget
                const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value.trim()
                if (!get('sname')) return
                s.addSupplement(get('sname'), get('sdose') || '—', get('stime') || 'daily')
                f.reset()
              }}
            >
              <input name="sname" className="field min-w-0 flex-1" placeholder="Supplement" aria-label="Supplement name" />
              <input name="sdose" className="field w-24" placeholder="Dose" aria-label="Dose" />
              <input name="stime" className="field w-28" placeholder="Timing" aria-label="Timing" />
              <button className="btn" type="submit">
                Add
              </button>
            </form>
          </Section>

          {PROTOCOLS.map((p) => (
            <Section key={p.title} label={p.title}>
              <ul className="max-w-2xl space-y-2.5">
                {p.lines.map((l, i) => (
                  <li key={i} className="flex gap-3 text-body leading-relaxed text-mute">
                    <span className="mt-2.5 block h-px w-3 shrink-0 bg-line-2" />
                    {l}
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>

        <div className="space-y-9 lg:sticky lg:top-8 lg:self-start">
          <Section label="Hydration">
            <div className="flex items-baseline justify-between">
              <span className="readout text-[2.5rem]">{(water / 1000).toFixed(1)}</span>
              <span className="num text-body text-faint">/ {(s.macros.waterMl / 1000).toFixed(1)}L</span>
            </div>
            <Bar pct={Math.min(100, (water / s.macros.waterMl) * 100)} className="mt-4" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[250, 500, 750].map((ml) => (
                <button key={ml} className="btn" onClick={() => s.addWater(date, ml)}>
                  +{ml}
                </button>
              ))}
            </div>
            <ul className="mt-5 space-y-2 text-micro leading-relaxed text-faint">
              <li>Front-load: a litre on waking, with electrolytes.</li>
              <li>500–1000 mg sodium in the morning; again around training.</li>
              <li>0.4–0.8 L per hour while training.</li>
              <li>Cut fluids one to two hours before bed.</li>
            </ul>
          </Section>

          {blackout && (
            <Section label="Blackout streak">
              <div className="flex items-baseline gap-2">
                <span className="readout text-[2.5rem]">{habitStreak(s, blackout)}</span>
                <span className="text-body text-faint">days</span>
              </div>
              <div className="mt-4">
                <Eyebrow className="mb-2">Last 30</Eyebrow>
                <Chain days={habitChain(s, blackout, 30)} />
              </div>
            </Section>
          )}
        </div>
      </div>
    </Page>
  )
}
