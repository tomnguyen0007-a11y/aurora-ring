import { uid } from './dates'
import type { GolfRound, HevySession } from '../store/types'

// ——— Live Hevy sync (official API, api.hevyapp.com — key from Hevy app: Settings → Developer / API) ———

interface HevyApiWorkout {
  title?: string
  start_time?: string
  exercises?: { sets?: { weight_kg?: number | null; reps?: number | null }[] }[]
}

export async function fetchHevyWorkouts(apiKey: string): Promise<HevySession[]> {
  const sessions: HevySession[] = []
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Hevy API ${res.status}${res.status === 401 ? ' — check the API key' : ''}`)
    const data: { workouts?: HevyApiWorkout[]; page_count?: number } = await res.json()
    for (const w of data.workouts ?? []) {
      const parsed = new Date(w.start_time ?? '')
      if (isNaN(parsed.getTime())) continue
      let sets = 0
      let volumeKg = 0
      for (const ex of w.exercises ?? [])
        for (const st of ex.sets ?? []) {
          sets++
          if (st.weight_kg && st.reps) volumeKg += st.weight_kg * st.reps
        }
      sessions.push({
        id: uid('hevy'),
        date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
        title: w.title || 'Workout',
        sets,
        volumeKg,
      })
    }
    if (!data.page_count || page >= data.page_count) break
  }
  return sessions.sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Tolerant CSV parser: handles quoted fields and commas inside quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') inQuotes = false
      else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const findCol = (header: string[], ...names: string[]) =>
  header.findIndex((h) => names.some((n) => h.toLowerCase().trim().includes(n)))

/**
 * Hevy workout export CSV → sessions grouped by (date, workout title).
 * Hevy's export has one row per set: title, start_time, exercise_title, weight, reps…
 */
export function parseHevyCSV(text: string): HevySession[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const h = rows[0]
  const iTitle = findCol(h, 'title')
  const iStart = findCol(h, 'start_time', 'start time', 'date')
  const iWeight = findCol(h, 'weight')
  const iReps = findCol(h, 'reps')
  if (iStart < 0) return []

  const grouped = new Map<string, HevySession>()
  for (const r of rows.slice(1)) {
    const rawDate = r[iStart] ?? ''
    const parsed = new Date(rawDate)
    if (isNaN(parsed.getTime())) continue
    const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
    const title = (iTitle >= 0 ? r[iTitle] : 'Workout') || 'Workout'
    const key = `${date}|${title}`
    let sess = grouped.get(key)
    if (!sess) {
      sess = { id: uid('hevy'), date, title, sets: 0, volumeKg: 0 }
      grouped.set(key, sess)
    }
    sess.sets += 1
    const w = parseFloat(r[iWeight] ?? '')
    const reps = parseFloat(r[iReps] ?? '')
    if (!isNaN(w) && !isNaN(reps)) sess.volumeKg += w * reps
  }
  return [...grouped.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
}

/**
 * Golfshot round export CSV → rounds. Golfshot exports vary; we look for
 * date + score (+ optional course) columns and take what we can.
 */
export function parseGolfshotCSV(text: string): GolfRound[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const h = rows[0]
  const iDate = findCol(h, 'date', 'played')
  const iScore = findCol(h, 'score', 'strokes', 'gross')
  const iCourse = findCol(h, 'course', 'facility')
  if (iDate < 0 || iScore < 0) return []

  const rounds: GolfRound[] = []
  for (const r of rows.slice(1)) {
    const parsed = new Date(r[iDate] ?? '')
    const score = parseInt(r[iScore] ?? '')
    if (isNaN(parsed.getTime()) || isNaN(score) || score < 50 || score > 150) continue
    rounds.push({
      id: uid('round'),
      date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
      course: iCourse >= 0 ? (r[iCourse] || '') : '',
      score,
    })
  }
  return rounds.sort((a, b) => (a.date < b.date ? 1 : -1))
}
