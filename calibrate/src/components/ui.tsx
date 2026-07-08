import { Check } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Click-to-edit text: renders as plain content until clicked, then becomes an
 * input. Enter or blur saves (only if changed), Escape cancels. The dotted
 * underline on hover is the affordance — the whole app's "everything is
 * editable, no forms" contract rides on this component.
 */
export function InlineEdit({
  value,
  onSave,
  num = false,
  className = '',
  inputClassName = '',
  label,
  placeholder = '—',
}: {
  value: string
  onSave: (next: string) => void
  /** numeric-ish content: use the mono font + inputMode for phone keyboards */
  num?: boolean
  className?: string
  inputClassName?: string
  /** accessible name, e.g. "Edit carbs for Lift day" */
  label: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) onSave(next)
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={label}
        className={`w-full min-w-0 rounded border border-signal/50 bg-black/60 px-1 py-0.5 text-inherit outline-none ring-1 ring-signal/20 ${num ? 'num' : ''} ${inputClassName}`}
        value={draft}
        inputMode={num ? 'decimal' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      title="Click to edit"
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={`min-w-0 cursor-text rounded px-1 py-0.5 text-left decoration-dotted underline-offset-4 transition-colors hover:bg-white/[0.05] hover:underline focus-visible:bg-white/[0.05] focus-visible:outline-1 focus-visible:outline-signal/60 ${num ? 'num' : ''} ${className}`}
    >
      {value || <span className="text-fog">{placeholder}</span>}
    </button>
  )
}

export function Panel({
  children,
  className = '',
  glow = false,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <section
      className={`glass rounded-2xl p-4 sm:p-5 animate-rise ${glow ? 'ring-1 ring-signal/20' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

export function HudLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`hud-label mb-3 flex items-center gap-2 ${className}`}>
      <span className="inline-block h-px w-4 bg-fog/60" />
      {children}
    </div>
  )
}

/** Radial progress ring */
export function Ring({
  pct,
  size = 120,
  stroke = 8,
  color = 'var(--color-signal)',
  track = 'rgba(255,255,255,0.07)',
  children,
}: {
  pct: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/** Horizontal meter with target band */
export function Meter({
  value,
  min,
  max,
  label,
  unit = '',
  color = 'var(--color-signal)',
}: {
  value: number
  min: number
  max: number
  label: string
  unit?: string
  color?: string
}) {
  const cap = max * 1.15
  const pct = Math.min(100, (value / cap) * 100)
  const lo = (min / cap) * 100
  const hi = (max / cap) * 100
  const inBand = value >= min && value <= max
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-haze">{label}</span>
        <span className="num text-xs text-ice">
          {Math.round(value)}
          <span className="text-fog">
            {unit} / {min}–{max}
            {unit}
          </span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-black/40">
        <div
          className="absolute inset-y-0 rounded-full opacity-20"
          style={{ left: `${lo}%`, width: `${hi - lo}%`, background: color }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: inBand ? 'var(--color-affirm)' : color,
            transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
            boxShadow: `0 0 8px ${inBand ? 'rgba(93,211,158,0.4)' : 'rgba(255,126,71,0.35)'}`,
          }}
        />
      </div>
    </div>
  )
}

/** Minimal sparkline */
export function Sparkline({
  points,
  width = 140,
  height = 36,
  color = 'var(--color-steel)',
}: {
  points: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (points.length < 2) {
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 4" />
      </svg>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - 4 - ((p - min) / span) * (height - 8)).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]
  const lastY = height - 4 - ((last - min) / span) * (height - 8)
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={lastY} r={3} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  )
}

/** Vertical bar chart */
export function Bars({
  data,
  height = 90,
  color = 'var(--color-signal)',
  unit = '',
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  unit?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.value}${unit}`}>
          <span className="num text-[10px] text-fog opacity-0 transition-opacity group-hover:opacity-100">
            {d.value}
          </span>
          <div
            className="w-full rounded-t-sm transition-all"
            style={{
              height: `${Math.max(3, (d.value / max) * (height - 34))}px`,
              background: d.value === 0 ? 'rgba(255,255,255,0.06)' : color,
              opacity: d.value === 0 ? 1 : 0.5 + 0.5 * (d.value / max),
            }}
          />
          <span className="hud-label !text-[9px] truncate max-w-full">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Designed checkbox */
export function CheckDot({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? 'toggle'}
      onClick={onToggle}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
        checked
          ? 'border-affirm bg-affirm/20 shadow-[0_0_10px_rgba(93,211,158,0.35)]'
          : 'border-edge-strong bg-black/30 hover:border-signal/60'
      }`}
    >
      <Check
        size={14}
        strokeWidth={3}
        className={`text-affirm transition-all duration-200 ${checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
      />
    </button>
  )
}

export function StatTile({
  label,
  value,
  sub,
  accent = 'text-ice',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-edge bg-black/25 px-3.5 py-3">
      <div className="hud-label !mb-1.5">{label}</div>
      <div className={`num text-xl font-semibold leading-none sm:text-2xl ${accent}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-fog">{sub}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-edge px-4 py-8 text-center text-sm text-fog">
      {children}
    </div>
  )
}

export const TAG_COLORS: Record<string, string> = {
  morning: '#7fb4d8',
  school: '#8b93a3',
  gym: '#ff7e47',
  golf: '#5dd39e',
  run: '#5dd39e',
  business: '#e0a458',
  meal: '#c9a3d4',
  study: '#8b93a3',
  recovery: '#7f8fd8',
  social: '#d8c47f',
  language: '#7fb4d8',
}
