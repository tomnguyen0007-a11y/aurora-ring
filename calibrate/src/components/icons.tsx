/* ═══════════════════════════════════════════════════════════════════
   CALIBRATE GLYPHS
   One icon system. Every glyph is drawn on the same 16×16 grid with a
   1.25px stroke, round caps, and a 2px safe margin — so nothing reads
   as an emoji, a sticker, or a different library's guest appearance.
   Weight is expressed by stroke width, never by fill.
   ═══════════════════════════════════════════════════════════════════ */

export const GLYPHS = {
  // ── navigation / sections ──
  today: 'M2.5 3.5h11v10h-11z M2.5 6.5h11 M5.5 2v2 M10.5 2v2',
  jarvis: 'M8 1.8v2.4 M8 11.8v2.4 M1.8 8h2.4 M11.8 8h2.4 M8 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z',
  goals: 'M8 2.2v11.6 M8 3.2h6.2l-1.7 2.3 1.7 2.3H8',
  training: 'M2 6.2v3.6 M4.6 4.2v7.6 M4.6 8h6.8 M11.4 4.2v7.6 M14 6.2v3.6',
  golf: 'M5 13.6h6 M6.6 13.6V2.4l5.2 2.3-5.2 2.3',
  nutrition: 'M2.4 7.4h11.2a5.6 5.6 0 0 1-11.2 0Z M8 2.2v3.4 M5.4 3.6v2 M10.6 3.6v2',
  recovery: 'M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z',
  grocery: 'M3.6 5.4h8.8l-.9 8.2H4.5Z M6 5.4V4a2 2 0 0 1 4 0v1.4',
  business: 'M2.2 5.4h11.6v8.2H2.2z M5.8 5.4V3.8a1.2 1.2 0 0 1 1.2-1.2h2a1.2 1.2 0 0 1 1.2 1.2v1.6 M2.2 9h11.6',
  notes: 'M3.4 2.4h9.2v11.2H3.4z M5.9 5.8h4.2 M5.9 8.4h4.2 M5.9 11h2.4',
  books: 'M8 4.4a3.4 3.4 0 0 0-5.6-1.2v8.6A3.4 3.4 0 0 1 8 13Z M8 4.4a3.4 3.4 0 0 1 5.6-1.2v8.6A3.4 3.4 0 0 0 8 13Z',
  mindset: 'M8 2.2 13.4 8 8 13.8 2.6 8Z M8 5.6 10.4 8 8 10.4 5.6 8Z',
  markets: 'M2.4 11.6 6.2 7.8l2.8 2.6 4.6-5.4 M13.6 5v3.2 M13.6 5h-3.2',
  news: 'M2.4 3.6h8.2v10H2.4z M10.6 6.4h3v5.8a1.4 1.4 0 0 1-2.8 0V6.4 M4.6 6.4h3.8 M4.6 9h3.8 M4.6 11.2h2.4',
  schedule: 'M2.4 4.2h11.2v9.4H2.4z M2.4 7.2h11.2 M5.4 2.2v3 M10.6 2.2v3',
  settings: 'M2.6 5.2h10.8 M2.6 10.8h10.8 M6 3.2v4 M10.6 8.8v4',
  custom: 'M8 2.4 13.6 8 8 13.6 2.4 8Z',

  // ── section-picker extras ──
  water: 'M8 2.2s4.2 4.4 4.2 7A4.2 4.2 0 0 1 3.8 9.2c0-2.6 4.2-7 4.2-7Z',
  heart: 'M8 13.4S2.6 10.2 2.6 6.4a2.9 2.9 0 0 1 5.4-1.5 2.9 2.9 0 0 1 5.4 1.5c0 3.8-5.4 7-5.4 7Z',
  spark: 'M8 2.2v11.6 M2.2 8h11.6 M4.1 4.1l7.8 7.8 M11.9 4.1l-7.8 7.8',
  flag: 'M3.6 2.4v11.2 M3.6 3.2h8.8l-1.8 2.8 1.8 2.8H3.6',
  compass: 'M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9Z M10.4 5.6 9.2 9.2 5.6 10.4 6.8 6.8Z',
  layers: 'M8 2.2 14 5.4 8 8.6 2 5.4Z M2 8.4 8 11.6l6-3.2 M2 11 8 14.2l6-3.2',
  bolt: 'M9.2 2.2 4.4 8.8h3.2l-.8 5 4.8-6.6H8.4Z',
  wave: 'M2 9.4c1.6-2.6 3-2.6 4.6 0s3 2.6 4.6 0 3-2.6 3.4-1.6 M2 5.4c1.6-2.6 3-2.6 4.6 0',
  box: 'M2.4 2.4h11.2v11.2H2.4z',

  // ── actions ──
  plus: 'M8 3.2v9.6 M3.2 8h9.6',
  minus: 'M3.2 8h9.6',
  check: 'M3.2 8.4 6.4 11.6 12.8 4.8',
  close: 'M4 4l8 8 M12 4l-8 8',
  search: 'M7.2 2.4a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z M10.8 10.8l2.8 2.8',
  trash: 'M2.8 4.4h10.4 M5.6 4.4V2.8h4.8v1.6 M4.2 4.4l.7 9.2h6.2l.7-9.2 M6.6 6.8v4.4 M9.4 6.8v4.4',
  edit: 'M10.6 2.6 13.4 5.4 5.6 13.2H2.8v-2.8z M9.2 4l2.8 2.8',
  drag: 'M5.6 3.4h.01 M10.4 3.4h.01 M5.6 8h.01 M10.4 8h.01 M5.6 12.6h.01 M10.4 12.6h.01',
  more: 'M3.4 8h.01 M8 8h.01 M12.6 8h.01',
  chevronDown: 'M3.6 5.8 8 10.2l4.4-4.4',
  chevronUp: 'M3.6 10.2 8 5.8l4.4 4.4',
  chevronLeft: 'M10.2 3.6 5.8 8l4.4 4.4',
  chevronRight: 'M5.8 3.6 10.2 8l-4.4 4.4',
  arrowRight: 'M2.6 8h10.8 M9.6 4.2 13.4 8l-3.8 3.8',
  arrowLeft: 'M13.4 8H2.6 M6.4 4.2 2.6 8l3.8 3.8',
  arrowUp: 'M8 13.4V2.6 M4.2 6.4 8 2.6l3.8 3.8',
  refresh: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.7 M13.4 2.2v3h-3',
  play: 'M5 3.2 12.4 8 5 12.8Z',
  pause: 'M6 3.4v9.2 M10 3.4v9.2',
  stop: 'M4 4h8v8H4z',
  mic: 'M8 2.2a1.9 1.9 0 0 1 1.9 1.9v3.6a1.9 1.9 0 0 1-3.8 0V4.1A1.9 1.9 0 0 1 8 2.2Z M4.2 7.4a3.8 3.8 0 0 0 7.6 0 M8 11.4v2.4 M5.8 13.8h4.4',
  image: 'M2.4 3.2h11.2v9.6H2.4z M2.4 10.2l3.2-3.2 3 3 2.2-2.2 2.8 2.8 M10.4 6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z',
  send: 'M13.8 2.2 7.2 9 M13.8 2.2 9.6 13.8 7.2 9 2.2 6.6Z',
  pin: 'M5.8 2.4h4.4 M8 2.4v5.2 M4.8 7.6h6.4l-1.2 2.2H6z M8 9.8v3.8',
  star: 'M8 2.4 9.8 6l4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.6l4-.6Z',
  bell: 'M4.4 11.4V7a3.6 3.6 0 0 1 7.2 0v4.4 M2.8 11.4h10.4 M6.4 13.4a1.7 1.7 0 0 0 3.2 0',
  bellOff: 'M4.4 11.4V7a3.6 3.6 0 0 1 4-3.6 M11.6 8.4V7 M2.8 11.4h10.4 M6.4 13.4a1.7 1.7 0 0 0 3.2 0 M2.4 2.4l11.2 11.2',
  clock: 'M8 2.2a5.8 5.8 0 1 0 0 11.6A5.8 5.8 0 0 0 8 2.2Z M8 4.8V8l2.4 1.6',
  timer: 'M8 3.6a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4Z M8 6v2.8l2 1.2 M6.2 1.8h3.6',
  download: 'M8 2.4v7.8 M4.8 7.4 8 10.6l3.2-3.2 M2.8 13.2h10.4',
  upload: 'M8 10.6V2.8 M4.8 6 8 2.8 11.2 6 M2.8 13.2h10.4',
  external: 'M9.2 3h3.8v3.8 M13 3 7.6 8.4 M11 9.6v3.4H3V5h3.4',
  eye: 'M1.8 8s2.4-4.2 6.2-4.2S14.2 8 14.2 8s-2.4 4.2-6.2 4.2S1.8 8 1.8 8Z M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z',
  eyeOff: 'M6.2 3.9A6.4 6.4 0 0 1 8 3.7c3.8 0 6.2 4.3 6.2 4.3a12 12 0 0 1-2 2.5M4 5A11.7 11.7 0 0 0 1.8 8s2.4 4.2 6.2 4.2a6.2 6.2 0 0 0 2-.3 M2.4 2.4l11.2 11.2',
  lock: 'M3.8 7h8.4v6.4H3.8z M5.8 7V5a2.2 2.2 0 0 1 4.4 0v2',
  key: 'M10.2 2.4a3.4 3.4 0 1 1-2.6 5.6L2.6 13v-2.6h2.2V8.6h1.8l1-1a3.4 3.4 0 0 1 2.6-5.2Z M11 5.2h.01',
  filter: 'M2.4 3.6h11.2L9.2 8.6v4.4l-2.4 1.2V8.6Z',
  copy: 'M5.6 5.6h7.8v7.8H5.6z M10.4 5.6V2.6H2.6v7.8h3',
  link: 'M6.6 9.4a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 1 0-4-4l-.8.8 M9.4 6.6a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 1 0 4 4l.8-.8',
  info: 'M8 2.2a5.8 5.8 0 1 0 0 11.6A5.8 5.8 0 0 0 8 2.2Z M8 7.4v3.4 M8 5.2h.01',
  warn: 'M8 2.4 14 12.8H2Z M8 6.4v3 M8 11.2h.01',
  sun: 'M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z M8 1.6v1.6 M8 12.8v1.6 M1.6 8h1.6 M12.8 8h1.6 M3.5 3.5l1.1 1.1 M11.4 11.4l1.1 1.1 M12.5 3.5l-1.1 1.1 M4.6 11.4l-1.1 1.1',
  sliders: 'M3 3.2v9.6 M8 3.2v9.6 M13 3.2v9.6 M1.6 6h2.8 M6.6 10.4h2.8 M11.6 5h2.8',
  command: 'M5.6 2.6a1.8 1.8 0 1 0 0 3.6h4.8a1.8 1.8 0 1 0 0-3.6v10.8a1.8 1.8 0 1 1 0-3.6H5.6a1.8 1.8 0 1 1 0 3.6Z',
  flame: 'M8 13.8c2.3 0 3.8-1.5 3.8-3.5 0-3-3.2-3.8-2.4-7.6C7.4 3.4 5.4 5.6 5.4 8c0 .9.3 1.6.8 2.2.2-1 .8-1.8 1.4-2.2-.4 2.2 1.8 2.4 1.8 4a1.4 1.4 0 0 1-1.4 1.4Z',
} as const

export type GlyphName = keyof typeof GLYPHS

/** Glyph names offered when picking an icon for a custom section. */
export const PICKABLE_GLYPHS: GlyphName[] = [
  'custom', 'today', 'goals', 'training', 'golf', 'nutrition', 'recovery', 'grocery',
  'business', 'notes', 'books', 'mindset', 'markets', 'news', 'schedule', 'water',
  'heart', 'spark', 'flag', 'compass', 'layers', 'bolt', 'wave', 'box', 'clock',
  'star', 'flame', 'sun', 'key', 'timer',
]

export function Icon({
  name,
  size = 16,
  className = '',
  strokeWidth = 1.25,
}: {
  name: GlyphName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GLYPHS[name]} />
    </svg>
  )
}

/**
 * The brand mark: an original angular wing — a hard, symmetrical
 * silhouette cut from the same geometry as the glyph grid. Not any
 * existing company's logo; drawn for Calibrate.
 */
export function Mark({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 32" width={size * 2} height={size} className={className} fill="currentColor" aria-hidden="true">
      <path d="M1 12 19 3 32 8 45 3 63 12 47 15.5 39 29 32 16 25 29 17 15.5Z" />
    </svg>
  )
}
