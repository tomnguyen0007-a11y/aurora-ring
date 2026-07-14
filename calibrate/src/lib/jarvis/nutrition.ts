// ————————————————————————————————————————————————————————
// DETERMINISTIC NUTRITION RESOLUTION
// The LLM's job is to NAME the food and the portion — never to guess macros.
// Real figures come from data, in strict preference order:
//   1. Local food DB (curated staples), scaled to the stated portion
//   2. Open Food Facts — a free, browser-callable database of real product
//      labels (per-100g macros), no API key required
//   3. null — the caller refuses to log rather than write a garbage entry
// This is what makes food logging accurate even when a weak free-tier model
// is answering: the model contributes language understanding, the numbers
// come from databases.
// ————————————————————————————————————————————————————————
import { todayISO } from '../dates'
import { macrosForDate } from '../stats'
import { useStore } from '../../store/store'
import { applyActions, type JarvisAction } from './actions'
import { countFoodMatches, foodTokens, lookupFood } from './foodDb'

export interface ResolvedFood {
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** where the figures came from — shown in the receipt so he can judge trust */
  source: 'food database' | 'Open Food Facts'
  detail: string
}

/** Extract an explicit portion in grams from a food name/phrase ("150g greek yogurt", "yogurt 150 g", "200ml milk"). */
export function parseGrams(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:g|grams?|ml)\b/i)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? v : null
}

const round1 = (n: number) => Math.round(n * 10) / 10

function scaled(fact: { kcal: number; protein: number; carbs: number; fat: number; gramsPerServing?: number; serving: string }, grams: number | null): ResolvedFood | null {
  if (grams == null) {
    return { kcal: fact.kcal, protein: fact.protein, carbs: fact.carbs, fat: fact.fat, source: 'food database', detail: fact.serving }
  }
  if (!fact.gramsPerServing) return null // can't scale honestly without a serving weight
  const f = grams / fact.gramsPerServing
  return {
    kcal: Math.round(fact.kcal * f),
    protein: round1(fact.protein * f),
    carbs: round1(fact.carbs * f),
    fat: round1(fact.fat * f),
    source: 'food database',
    detail: `${grams}g`,
  }
}

interface OffProduct {
  product_name?: string
  nutriments?: Record<string, number>
}

/**
 * Search Open Food Facts for a product with usable label data. Picks the first
 * result carrying per-100g energy and protein — completeness beats rank.
 * Returns null on any failure (offline, CORS hiccup, nothing usable).
 */
export async function searchOpenFoodFacts(query: string): Promise<{ name: string; per100g: { kcal: number; protein: number; carbs: number; fat: number } } | null> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,nutriments`
    const res = await fetch(url)
    if (!res.ok) return null
    const data: { products?: OffProduct[] } = await res.json()
    for (const p of data.products ?? []) {
      const n = p.nutriments
      const kcal = n?.['energy-kcal_100g']
      const protein = n?.proteins_100g
      if (n && typeof kcal === 'number' && kcal > 0 && typeof protein === 'number') {
        return {
          name: p.product_name || query,
          per100g: { kcal, protein, carbs: n.carbohydrates_100g ?? 0, fat: n.fat_100g ?? 0 },
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Resolve real macros for a named food and optional portion. Local DB first
 * (curated, instant, offline), Open Food Facts second (real labels), null last.
 */
export async function resolveNutrition(name: string, portionGrams?: number | null): Promise<ResolvedFood | null> {
  const grams = portionGrams ?? parseGrams(name)

  const local = lookupFood(name)
  if (local) {
    const hit = scaled(local, grams)
    if (hit) return hit
  }

  const off = await searchOpenFoodFacts(name.replace(/\d+(?:[.,]\d+)?\s*(?:g|grams?|ml)\b/gi, '').trim() || name)
  if (off) {
    const g = grams ?? 100
    const f = g / 100
    return {
      kcal: Math.round(off.per100g.kcal * f),
      protein: round1(off.per100g.protein * f),
      carbs: round1(off.per100g.carbs * f),
      fat: round1(off.per100g.fat * f),
      source: 'Open Food Facts',
      detail: `${off.name}, ${g}g`,
    }
  }

  return null
}

// ————————————————————————————————————————————————————————
// LOCAL MULTI-ITEM FOOD LOGGING — the "no model needed" path.
// A food message like "log chocolate porridge, and then 150g greek yogurt"
// is split into items, each resolved from real data (DB scaled to portion,
// then Open Food Facts). If EVERY item resolves, it's logged instantly —
// free, offline-capable for DB items, identical quality on any device.
// If anything can't be resolved from data, return null and let the LLM
// handle it — precision over coverage.
// ————————————————————————————————————————————————————————

const FOOD_VERB = /^(?:log(?:\s+in)?|ate|had|eat|eating|track|record|i\s+(?:ate|had))\b/i
// Messages that are clearly other domains (the local engine or LLM owns those).
// Plain water logging is handled by the engine's own patterns before this runs,
// so "water" as an ingredient ("porridge with hot water") must NOT disqualify.
const NON_FOOD =
  /\b(golf|putt(?:ing)?|chip(?:ping)?|drill|run|ran|km|sleep|slept|read(?:ing)?|revenue|sale|weight|kg|handicap|workout|gym|note|idea|thought|task|goal|mantra|book|remember|photo|schedule|block|session)\b/i

/** True when an Open Food Facts result plausibly IS the asked-for item, not a random product. */
function offRelevant(segment: string, productName: string): boolean {
  const pn = productName.toLowerCase()
  return segment
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .some((w) => pn.includes(w))
}

/**
 * Try to fully resolve a food-logging message from real data with NO language
 * model involved. Returns the spoken reply + receipts after logging, or null
 * when this message isn't confidently food / any item can't be resolved.
 */
export async function tryLocalFoodLog(text: string): Promise<{ reply: string; receipts: string[] } | null> {
  const t = text.trim()
  if (!FOOD_VERB.test(t) || NON_FOOD.test(t)) return null

  const body = t
    .replace(FOOD_VERB, '')
    .replace(/^\s*(?:a|an|the|some|my|of)\s+/i, '')
    .trim()
  if (body.length < 3) return null

  const segments = body
    .split(/[,;]|\band then\b|\bthen\b|\bplus\b|\bfollowed by\b|&/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
  if (!segments.length || segments.length > 4) return null

  const resolved: { name: string; hit: ResolvedFood }[] = []
  for (const seg of segments) {
    // A segment with no meaningful food tokens ("hot water" alone) means this
    // message isn't confidently food — hand it to the engine/LLM instead.
    if (!foodTokens(seg).length) return null
    // Two different DB foods in ONE segment ("chicken and rice") — logging just
    // one would be silently wrong; the LLM should split that into proper items.
    if (countFoodMatches(seg) > 1) return null

    const grams = parseGrams(seg)
    let hit: ResolvedFood | null = null
    let name = ''

    const local = lookupFood(seg)
    if (local) {
      hit = scaled(local, grams)
      name = local.matchedAlias
    }
    if (!hit) {
      const off = await searchOpenFoodFacts(seg.replace(/\d+(?:[.,]\d+)?\s*(?:g|grams?|ml)\b/gi, '').trim() || seg)
      if (off && offRelevant(seg, off.name)) {
        const g = grams ?? 100
        const f = g / 100
        hit = {
          kcal: Math.round(off.per100g.kcal * f),
          protein: round1(off.per100g.protein * f),
          carbs: round1(off.per100g.carbs * f),
          fat: round1(off.per100g.fat * f),
          source: 'Open Food Facts',
          detail: `${off.name}, ${g}g`,
        }
        name = off.name
      }
    }
    if (!hit) return null // one unresolvable item → the whole message goes to the LLM

    resolved.push({ name: grams ? `${name} (${grams}g)` : name, hit })
  }

  const actions: JarvisAction[] = resolved.map(({ name, hit }) => ({
    type: 'log_food',
    name,
    kcal: hit.kcal,
    protein: hit.protein,
    carbs: hit.carbs,
    fat: hit.fat,
    resolvedFrom: hit.source,
  }))
  const receipts = applyActions(actions)
  const total = macrosForDate(useStore.getState(), todayISO()).kcal
  const items = resolved.map((x) => `${x.name} — ${x.hit.kcal} kcal / ${x.hit.protein}g protein`).join(', ')
  return { reply: `Fuel logged from real data: ${items}. Running total ${total} kcal.`, receipts }
}

/**
 * Fill in macros for any log_food action the model (correctly) left blank.
 * Mutates nothing; returns a new array. Actions that stay unresolvable keep
 * kcal undefined — applyActions refuses to log those rather than write a
 * 0-kcal garbage entry, and tells the user what it needs.
 */
export async function enrichLogFoodActions(actions: JarvisAction[]): Promise<JarvisAction[]> {
  return Promise.all(
    actions.map(async (a) => {
      if (a.type !== 'log_food' || a.kcal != null) return a
      const hit = await resolveNutrition(a.name, a.portionGrams)
      if (!hit) return a
      return { ...a, kcal: hit.kcal, protein: a.protein ?? hit.protein, carbs: a.carbs ?? hit.carbs, fat: a.fat ?? hit.fat, resolvedFrom: `${hit.source} (${hit.detail})` }
    }),
  )
}
