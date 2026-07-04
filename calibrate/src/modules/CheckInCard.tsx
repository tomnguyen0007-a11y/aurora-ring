import { ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { HudLabel, Panel } from '../components/ui'
import { todayISO } from '../lib/dates'
import { useStore } from '../store/store'

/** Evening systems audit — weight, sleep, blackout compliance */
export function CheckInCard() {
  const s = useStore()
  const date = todayISO()
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
      weightKg: weight ? parseFloat(weight) : null,
      sleepH: sleep ? parseFloat(sleep) : null,
      sleepQuality: quality || null,
      energy: energy || null,
      blackoutOnTime: blackout,
      notes: existing?.notes ?? '',
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const Dots = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-haze">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            aria-label={`${label} ${v}`}
            onClick={() => onChange(v === value ? 0 : v)}
            className={`h-4 w-4 rounded-full border transition-all ${
              v <= value ? 'border-signal bg-signal/70 shadow-[0_0_6px_rgba(246,184,60,0.5)]' : 'border-edge-strong bg-black/30 hover:border-signal/50'
            }`}
          />
        ))}
      </div>
    </div>
  )

  return (
    <Panel>
      <HudLabel>
        <ClipboardCheck size={11} className="text-steel" /> Systems Audit — Today
      </HudLabel>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Weight kg</span>
            <input
              className="field num w-full"
              inputMode="decimal"
              placeholder="84.2"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Sleep h</span>
            <input
              className="field num w-full"
              inputMode="decimal"
              placeholder="8"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
          </label>
        </div>
        <Dots label="Sleep quality" value={quality} onChange={setQuality} />
        <Dots label="Energy" value={energy} onChange={setEnergy} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-haze">22:30 blackout hit?</span>
          <div className="flex gap-1.5">
            <button
              className={`btn !px-3 !py-1 !text-xs ${blackout === true ? '!border-affirm/60 !bg-affirm/15 !text-affirm' : ''}`}
              onClick={() => setBlackout(true)}
            >
              Yes
            </button>
            <button
              className={`btn !px-3 !py-1 !text-xs ${blackout === false ? '!border-alert/60 !bg-alert/15 !text-alert' : ''}`}
              onClick={() => setBlackout(false)}
            >
              No
            </button>
          </div>
        </div>
        <button className="btn btn-signal w-full" onClick={save}>
          {saved ? 'Logged ✓' : existing ? 'Update audit' : 'Log audit'}
        </button>
      </div>
    </Panel>
  )
}
