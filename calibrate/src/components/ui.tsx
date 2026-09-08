import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type GlyphName } from './icons'

/* ═══════════════════════════════════════════════════════════════════
   PRIMITIVES
   Every component here obeys the same three rules: structure comes
   from whitespace and hairlines, colour is monochrome, and numbers
   are set in the mono face so columns align.
   ═══════════════════════════════════════════════════════════════════ */

export function Page({
  title,
  lede,
  actions,
  children,
  fill = false,
}: {
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Claim the full height of <main> instead of flowing — for a page that owns
      its own scrolling, like a chat transcript with a composer pinned under it. */
  fill?: boolean
}) {
  return (
    <div className={`animate-fade ${fill ? 'flex h-full flex-col' : ''}`}>
      <header
        className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 ${fill ? 'mb-6 shrink-0' : 'mb-11'}`}
      >
        <div className="min-w-0">
          <h1 className="t-page">{title}</h1>
          {lede && <p className="mt-1.5 max-w-xl text-body text-dim">{lede}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      <div className={fill ? 'flex min-h-0 flex-1 flex-col' : 'space-y-14 pb-6 sm:space-y-16'}>{children}</div>
    </div>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>
}

/** A content block. Hairline above, label, content. No box, no fill. */
export function Section({
  label,
  aside,
  children,
  className = '',
  id,
}: {
  label?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={`pane ${className}`}>
      {(label || aside) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {label ? <Eyebrow>{label}</Eyebrow> : <span />}
          {aside && <div className="flex items-center gap-1.5">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** A list row: hairline underneath, hover reveals its controls. */
export function Row({
  children,
  className = '',
  onClick,
  muted = false,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  muted?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`group flex w-full items-center gap-3 border-b border-line py-2.5 text-left transition-opacity last:border-b-0 ${
        muted ? 'opacity-45' : ''
      } ${onClick ? 'hover:opacity-100' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

/** Controls that only appear on hover (desktop) but are always present on touch. */
export function Tools({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
      {children}
    </div>
  )
}

export function IconBtn({
  glyph,
  label,
  onClick,
  disabled,
  active,
  size = 14,
  className = '',
}: {
  glyph: GlyphName
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  size?: number
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xs p-1.5 transition-colors ${
        active ? 'text-paper' : 'text-faint hover:text-paper'
      } disabled:opacity-25 disabled:hover:text-faint ${className}`}
    >
      <Icon name={glyph} size={size} />
    </button>
  )
}

/** Up/down reorder pair — the flexibility affordance used everywhere. */
export function Reorder({
  onUp,
  onDown,
  first,
  last,
}: {
  onUp: () => void
  onDown: () => void
  first: boolean
  last: boolean
}) {
  return (
    <>
      <IconBtn glyph="chevronUp" label="Move up" onClick={onUp} disabled={first} size={12} />
      <IconBtn glyph="chevronDown" label="Move down" onClick={onDown} disabled={last} size={12} />
    </>
  )
}

/** Destructive action that asks once, inline, with no modal. */
export function DangerBtn({
  onConfirm,
  label = 'Delete',
  glyph = 'trash',
}: {
  onConfirm: () => void
  label?: string
  glyph?: GlyphName
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3200)
    return () => clearTimeout(t)
  }, [armed])
  // Same footprint both states — swapping to a text "Confirm" button widened
  // the row and pushed it past crowded, shrink-0-packed controls (the counter
  // habit editor: label, target, unit, reorder, delete) with nowhere for the
  // overflow to go, so the confirm tap landed off-screen and looked broken.
  if (armed) {
    return <IconBtn glyph="check" label={`Confirm: ${label}`} onClick={onConfirm} className="!text-paper" />
  }
  return <IconBtn glyph={glyph} label={label} onClick={() => setArmed(true)} />
}

/* ─────────────────────────────────────────────
   INLINE EDITING — every label in the app is a
   text field wearing a disguise.
   ───────────────────────────────────────────── */

export function InlineText({
  value,
  onChange,
  placeholder = '—',
  className = '',
  ariaLabel,
  mono = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  ariaLabel: string
  mono?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  return (
    <input
      className={`field-line w-full ${mono ? 'num' : ''} ${className}`}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false
        if (draft !== value) onChange(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** Auto-growing inline textarea. */
export function InlineArea({
  value,
  onChange,
  placeholder = '',
  className = '',
  ariaLabel,
  minRows = 2,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  ariaLabel: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    resize()
    // The box was sized once, on mount, against whatever width and font
    // metrics existed at that instant. A phone loads the custom webfont
    // *after* first paint, and that swap reflows text into more lines at
    // the same width — this was the actual clipping bug (looked font-fine
    // on a warm desktop cache, cut on a cold mobile load). Re-measure once
    // the real font is in, and again on rotate/resize.
    document.fonts?.ready?.then(resize).catch(() => {})
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draft])
  return (
    <textarea
      ref={ref}
      rows={minRows}
      className={`w-full resize-none bg-transparent text-body leading-relaxed text-mute outline-none placeholder:text-faint focus:text-paper ${className}`}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false
        if (draft !== value) onChange(draft)
      }}
    />
  )
}

/** Numeric inline cell — mono, right-aligned, commits on blur. */
export function NumCell({
  value,
  onChange,
  placeholder = '—',
  width = 'w-14',
  ariaLabel,
  suffix,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  width?: string
  ariaLabel: string
  suffix?: string
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value))
  }, [value])
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <input
        className={`field-line num ${width} text-right text-paper`}
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          focused.current = false
          const n = parseFloat(draft.replace(',', '.'))
          onChange(draft.trim() === '' || isNaN(n) ? null : n)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suffix && <span className="text-micro text-faint">{suffix}</span>}
    </span>
  )
}

/* ─────────────────────────────────────────────
   DATA DISPLAY
   ───────────────────────────────────────────── */

export function Stat({
  label,
  value,
  sub,
  strong = false,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  strong?: boolean
}) {
  return (
    <div>
      <div className={`readout text-[1.375rem] ${strong ? 'text-paper' : 'text-paper/85'}`}>{value}</div>
      <div className="eyebrow mt-1.5">{label}</div>
      {sub && <div className="mt-1 text-micro text-faint">{sub}</div>}
    </div>
  )
}

/** 1px progress line. The only "chart" most numbers need. */
export function Bar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`relative h-px w-full bg-line ${className}`}>
      <div
        className="absolute inset-y-0 left-0 bg-paper transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

/**
 * Metric against a target band. The band is a hairline notch on the
 * track, not a coloured zone — hue would break the system.
 */
export function Track({
  label,
  value,
  min,
  max,
  unit = '',
  onEditTarget,
}: {
  label: ReactNode
  value: number
  min: number
  max: number
  unit?: string
  onEditTarget?: () => void
}) {
  const ceiling = Math.max(max * 1.12, value * 1.02, 1)
  const pct = (value / ceiling) * 100
  const lo = (min / ceiling) * 100
  const hi = (max / ceiling) * 100
  const inBand = value >= min && value <= max
  return (
    <div className="py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-body text-mute">{label}</span>
        <span className="num text-body text-paper">
          {Math.round(value)}
          <span className="text-faint">
            {unit} · {min}–{max}
            {unit}
          </span>
          {onEditTarget && (
            <button className="ml-2 align-middle text-faint hover:text-paper" onClick={onEditTarget} aria-label="Edit target">
              <Icon name="edit" size={11} />
            </button>
          )}
        </span>
      </div>
      <div className="relative h-[3px] w-full">
        <div className="absolute inset-x-0 top-1 h-px bg-line" />
        <div className="absolute top-0 h-[3px] w-px bg-line-2" style={{ left: `${lo}%` }} />
        <div className="absolute top-0 h-[3px] w-px bg-line-2" style={{ left: `${hi}%` }} />
        <div
          className={`absolute top-1 h-px transition-[width] duration-500 ease-out ${inBand ? 'bg-paper' : 'bg-paper/55'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

/** Radial ring. One stroke, no glow unless it's the page's focal element. */
export function Ring({
  pct,
  size = 96,
  stroke = 1.5,
  children,
  focal = false,
}: {
  pct: number
  size?: number
  stroke?: number
  children?: ReactNode
  focal?: boolean
}) {
  const r = (size - stroke * 2) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#ffffff"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{
            transition: 'stroke-dashoffset 0.7s cubic-bezier(0.2,0,0,1)',
            filter: focal ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' : undefined,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function Spark({
  points,
  width = 132,
  height = 30,
}: {
  points: number[]
  width?: number
  height?: number
}) {
  if (points.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 4" />
      </svg>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const y = (p: number) => height - 2 - ((p - min) / span) * (height - 4)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <path d={d} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(points[points.length - 1])} r={1.75} fill="#fff" />
    </svg>
  )
}

/** Column chart. Value is encoded by height and alpha — never by hue. */
export function Cols({
  data,
  height = 72,
  unit = '',
}: {
  data: { label: string; value: number }[]
  height?: number
  unit?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group/col flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${d.label}: ${d.value}${unit}`}>
          <span className="num text-micro text-faint opacity-0 transition-opacity group-hover/col:opacity-100">{d.value || ''}</span>
          <div
            className="w-full transition-all duration-500"
            style={{
              height: `${Math.max(1, (d.value / max) * (height - 26))}px`,
              background: d.value === 0 ? 'rgba(255,255,255,0.07)' : `rgba(255,255,255,${(0.3 + 0.7 * (d.value / max)).toFixed(2)})`,
            }}
          />
          <span className="eyebrow max-w-full truncate !text-[9px]">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Don't-break-the-chain strip: one square per day, filled when hit. */
export function Chain({ days, size = 7 }: { days: boolean[]; size?: number }) {
  return (
    <div className="flex flex-wrap gap-[3px]" aria-hidden="true">
      {days.map((hit, i) => (
        <span
          key={i}
          className="block"
          style={{
            width: size,
            height: size,
            background: hit ? '#ffffff' : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  )
}

export function Dot({
  checked,
  onToggle,
  label,
  size = 18,
}: {
  checked: boolean
  onToggle: () => void
  label?: string
  size?: number
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? 'toggle'}
      onClick={onToggle}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
        checked ? 'border-paper bg-paper text-black' : 'border-line-2 text-transparent hover:border-line-3'
      }`}
    >
      <Icon name="check" size={size * 0.6} strokeWidth={2} />
    </button>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full border transition-colors ${
        on ? 'border-paper bg-paper' : 'border-line-2 bg-transparent'
      }`}
    >
      <span
        className={`absolute top-[2px] h-3 w-3 rounded-full transition-all ${
          on ? 'left-[15px] bg-black' : 'left-[2px] bg-line-3'
        }`}
      />
    </button>
  )
}

export function Chip({
  active,
  onClick,
  children,
  className = '',
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xs border px-2.5 py-1 text-micro font-medium transition-colors ${
        active ? 'border-paper bg-paper text-black' : 'border-line text-dim hover:border-line-2 hover:text-paper'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-body text-faint">{children}</div>
}

/** Bottom sheet on mobile, centred panel on desktop. Flat, hairlined. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`animate-lift max-h-[86dvh] w-full overflow-y-auto border-t border-line-2 bg-ink px-5 pb-8 pt-5 sm:max-h-[80dvh] sm:rounded-xs sm:border ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <Eyebrow>{title}</Eyebrow>
          <IconBtn glyph="close" label="Close" onClick={onClose} size={15} />
        </div>
        {children}
      </div>
    </div>
  )
}

/** Horizontal scroller for tab strips that must never wrap. */
export function Scroller({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`no-bar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 ${className}`}>{children}</div>
}
