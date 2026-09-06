import { useState } from 'react'
import { Dot } from '../components/ui'
import { todayISO } from '../lib/dates'
import { useStore } from '../store/store'

/** Evening audit. Five fields, one commit, no ceremony. */
export function CheckInCard({ date = todayISO() }: { date?: string }) {
  const s = useStore()
  const existing = s.checkIns[date]
  const [weight, setWeight] = useState(existing?.weightKg?.toString() ?? '')
  const [sleep, setSleep] = useState(existing?.sleepH?.toString() ?? '')
  const [quality, setQuality] = useState(existing?.sleepQuality ?? 0)
  const [energy, setEnergy] = useState(existing?.energy ?? 0)
  const [blackout, setBlackout] = useState<boolean | null>(existing?.blackoutOnTime ?? null)
  const [saved, setSaved] = useState(false)

  const save = () => {
    s.saveCheckIn({
      date,
      weightKg: weight ? parseFloat(weight.replace(',', '.')) : null,
      sleepH: sleep ? parseFloat(sleep.replace(',', '.')) : null,
      sleepQuality: quality || null,
      energy: energy || null,
      blackoutOnTime: blackout,
      notes: existing?.notes ?? '',
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const Scale = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="flex items-center justify-between border-b border-line py-3">
      <span className="text-body text-mute">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            aria-label={`${label} ${v}`}
            onClick={() => onChange(v === value ? 0 : v)}
            className={`h-3.5 w-3.5 border transition-colors ${
              v <= value ? 'border-paper bg-paper' : 'border-line-2 bg-transparent hover:border-line-3'
            }`}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6">
        <label className="flex items-baseline justify-between gap-2 border-b border-line py-3">
          <span className="text-body text-mute">Weight</span>
          <span className="flex items-baseline gap-1">
            <input
              className="field-line num w-14 text-right text-paper"
              inputMode="decimal"
              placeholder="—"
              aria-label="Weight in kilograms"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <span className="text-micro text-faint">kg</span>
          </span>
        </label>
        <label className="flex items-baseline justify-between gap-2 border-b border-line py-3">
          <span className="text-body text-mute">Sleep</span>
          <span className="flex items-baseline gap-1">
            <input
              className="field-line num w-14 text-right text-paper"
              inputMode="decimal"
              placeholder="—"
              aria-label="Hours slept"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
            <span className="text-micro text-faint">h</span>
          </span>
        </label>
      </div>
      <Scale label="Sleep quality" value={quality} onChange={setQuality} />
      <Scale label="Energy" value={energy} onChange={setEnergy} />
      <div className="flex items-center justify-between border-b border-line py-3">
        <span className="text-body text-mute">Blackout on time</span>
        <div className="flex items-center gap-2">
          <Dot checked={blackout === true} onToggle={() => setBlackout(blackout === true ? null : true)} label="Blackout hit" size={16} />
          <button
            className={`btn btn-sm ${blackout === false ? '!border-paper !text-paper' : ''}`}
            onClick={() => setBlackout(blackout === false ? null : false)}
          >
            Missed
          </button>
        </div>
      </div>
      <button className="btn btn-solid mt-4 w-full" onClick={save}>
        {saved ? 'Logged' : existing ? 'Update audit' : 'Log the day'}
      </button>
    </div>
  )
}
