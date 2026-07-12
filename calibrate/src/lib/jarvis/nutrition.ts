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
import type { JarvisAction } from './actions'
import { lookupFood } from './foodDb'

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
