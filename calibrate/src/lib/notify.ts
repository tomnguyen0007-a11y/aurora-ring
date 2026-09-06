import { useStore } from '../store/store'
import { dayScore, habitHit } from './habits'
import { todayISO, weekdayOf } from './dates'

/* ════════════════════════════════════════════════════════════════════
   REMINDERS
   A static site can't run a push server, so this is honest about what
   it is: a precise local scheduler that fires while the app is open or
   installed as a PWA. It never double-fires, never fires for a minute
   that has already passed, and every reminder is editable.
   ════════════════════════════════════════════════════════════════════ */

const FIRED_KEY = 'calibrate-fired'
const CHECK_MS = 20_000

function firedToday(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as { date?: string; ids?: string[] }
    if (raw.date !== todayISO()) return new Set()
    return new Set(raw.ids ?? [])
  } catch {
    return new Set()
  }
}

function markFired(id: string) {
  const set = firedToday()
  set.add(id)
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ date: todayISO(), ids: [...set] }))
  } catch {
    /* storage full or blocked — the reminder still fired */
  }
}

export function notifyPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Show a notification. Prefers the service worker registration, which is
 * the only path iOS honours for an installed PWA.
 */
export async function notify(title: string, body: string, tag: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const options: NotificationOptions = {
    body,
    tag,
    icon: './icon-192.png',
    badge: './icon-192.png',
    silent: false,
  }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await reg.showNotification(title, options)
        return
      }
    }
    new Notification(title, options)
  } catch {
    /* some browsers refuse the constructor form — nothing else to do */
  }
}

/** App-icon badge with the number of habits still open today. */
export function updateBadge(): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (!nav.setAppBadge) return
  const s = useStore.getState()
  const { done, total } = dayScore(s)
  const open = Math.max(0, total - done)
  void (open ? nav.setAppBadge(open) : nav.clearAppBadge?.())
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** One tick: fire anything due in the last 5 minutes that hasn't fired yet. */
async function tick(): Promise<void> {
  const s = useStore.getState()
  if (!s.settings.remindersEnabled) return
  if (notifyPermission() !== 'granted') return

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const wd = weekdayOf(now)
  const fired = firedToday()

  for (const r of s.reminders) {
    if (!r.enabled) continue
    if (r.days.length && !r.days.includes(wd)) continue
    const due = toMin(r.time)
    if (nowMin < due || nowMin > due + 5) continue
    if (fired.has(r.id)) continue

    // Don't nag about something already handled: if the reminder points at a
    // habit that's already hit, stay quiet.
    const linked = s.habits.find((h) => r.label.toLowerCase().includes(h.label.toLowerCase().split(' ')[0]))
    if (linked && habitHit(s, todayISO(), linked)) {
      markFired(r.id)
      continue
    }

    markFired(r.id)
    await notify('Calibrate', r.body || r.label, `rem-${r.id}`)
  }

  updateBadge()
}

let timer: ReturnType<typeof setInterval> | null = null

export function startReminderLoop(): () => void {
  if (timer) clearInterval(timer)
  void tick()
  timer = setInterval(() => void tick(), CHECK_MS)

  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick()
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    if (timer) clearInterval(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * Everything that needs attention right now, as text. Rendered in the app
 * (always) and pushed as notifications (only when the user asked for it).
 */
export interface Nudge {
  id: string
  text: string
  urgent: boolean
  action?: { label: string; sectionId: string }
}

export function computeNudges(): Nudge[] {
  const s = useStore.getState()
  const date = todayISO()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const out: Nudge[] = []

  // Waking window 06:30 → 22:30 as a fraction, for pace checks.
  const frac = Math.min(1, Math.max(0, (nowMin - 390) / 960))

  for (const h of s.habits.filter((x) => !x.archived && x.kind === 'count')) {
    if (habitHit(s, date, h)) continue
    const value = h.id === 'h-water' ? (s.water[date] ?? 0) : undefined
    const expected = h.target * frac
    const current = value ?? 0
    if (nowMin > 600 && h.id === 'h-water' && current < expected * 0.6) {
      out.push({
        id: 'pace-water',
        text: `Hydration behind pace — ${(current / 1000).toFixed(1)}L against ~${(expected / 1000).toFixed(1)}L by now.`,
        urgent: true,
        action: { label: 'Fuel', sectionId: 'nutrition' },
      })
    }
  }

  const workout = s.workouts.find((w) => w.weekday === weekdayOf())
  if (workout && nowMin > 1080) {
    const done = s.workoutLogs.some((l) => l.date === date && l.workoutId === workout.id && l.completed)
    if (!done)
      out.push({
        id: 'session',
        text: `${workout.name} still unlogged.`,
        urgent: true,
        action: { label: 'Training', sectionId: 'training' },
      })
  }

  const closeout = toMin(s.settings.closeoutTime || '21:00')
  if (nowMin >= closeout && !s.checkIns[date]) {
    out.push({
      id: 'closeout',
      text: 'Evening audit still open — weight, sleep, blackout.',
      urgent: false,
      action: { label: 'Close out', sectionId: 'today' },
    })
  }

  // Yesterday left half-empty: offer to backfill rather than lose the day.
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yISO = yesterday.toISOString().slice(0, 10)
  if (!s.checkIns[yISO] && nowMin < 720) {
    out.push({ id: 'backfill', text: 'Yesterday was never closed out. Backfill it in one tap.', urgent: false })
  }

  return out
}
