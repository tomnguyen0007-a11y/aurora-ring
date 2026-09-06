import { FOOD_DB, lookupFood } from './jarvis/foodDb'

/* ════════════════════════════════════════════════════════════════════
   NUTRITION LOOKUP
   The old app carried a 22-item hardcoded table and told the model to
   invent everything else, which is exactly how you end up with confident
   wrong macros. This queries real databases instead:

     · the local curated table  — instant, hand-checked staples
     · USDA FoodData Central    — generic whole foods, per 100 g
     · Open Food Facts          — branded and European products

   Both remote sources send permissive CORS headers, so this works from a
   static origin with no proxy. Every result carries its source, so Jarvis
   can cite where a number came from rather than asserting it.
   ════════════════════════════════════════════════════════════════════ */

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface FoodMatch {
  name: string
  brand?: string
  source: 'local' | 'usda' | 'openfoodfacts'
  /** Always per 100 g, so portions can be scaled honestly. */
  per100g: Macros
  /** The label's own serving, when it declares one. */
  serving?: { label: string; grams: number }
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp

/** Scale a per-100g match to a real portion. */
export function scaleTo(match: FoodMatch, grams: number): Macros {
  const f = grams / 100
  return {
    kcal: Math.round(match.per100g.kcal * f),
    protein: round(match.per100g.protein * f),
    carbs: round(match.per100g.carbs * f),
    fat: round(match.per100g.fat * f),
  }
}

/** "330 ml", "1 bar (45g)", "45 g" → grams, best effort. */
function parseGrams(text: string | undefined): number | null {
  if (!text) return null
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(g|gram|ml)/i)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  return isFinite(v) && v > 0 && v < 5000 ? v : null
}

// ── Local curated table ────────────────────────────────────────────

function localMatches(query: string): FoodMatch[] {
  const hit = lookupFood(query)
  if (!hit) return []
  const grams = parseGrams(hit.serving)
  // The local table is stored per serving; normalise it to per 100 g.
  const basis = grams ?? 100
  const f = 100 / basis
  return [
    {
      name: hit.aliases[0],
      source: 'local',
      per100g: {
        kcal: Math.round(hit.kcal * f),
        protein: round(hit.protein * f),
        carbs: round(hit.carbs * f),
        fat: round(hit.fat * f),
      },
      serving: { label: hit.serving, grams: basis },
    },
  ]
}

// ── USDA FoodData Central ──────────────────────────────────────────

interface UsdaNutrient {
  nutrientId?: number
  nutrientName?: string
  value?: number
}
interface UsdaFood {
  description?: string
  brandOwner?: string
  dataType?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients?: UsdaNutrient[]
}

const USDA_IDS: Record<keyof Macros, number> = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 }

function usdaMacros(f: UsdaFood): Macros | null {
  const pick = (id: number) => f.foodNutrients?.find((n) => n.nutrientId === id)?.value
  const kcal = pick(USDA_IDS.kcal)
  if (kcal == null) return null
  return {
    kcal: Math.round(kcal),
    protein: round(pick(USDA_IDS.protein) ?? 0),
    carbs: round(pick(USDA_IDS.carbs) ?? 0),
    fat: round(pick(USDA_IDS.fat) ?? 0),
  }
}

export async function searchUsda(query: string, apiKey: string, signal?: AbortSignal): Promise<FoodMatch[]> {
  const key = apiKey?.trim() || 'DEMO_KEY'
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}` +
    `&pageSize=4&dataType=${encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS)')}&api_key=${key}`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { foods?: UsdaFood[] }
  return (data.foods ?? [])
    .map((f): FoodMatch | null => {
      const per100g = usdaMacros(f)
      if (!per100g) return null
      // Foundation and SR Legacy report per 100 g by definition.
      return {
        name: (f.description ?? '').toLowerCase().replace(/\s*,\s*/g, ', '),
        source: 'usda',
        per100g,
        serving:
          f.servingSize && f.servingSizeUnit?.toLowerCase() === 'g'
            ? { label: `${f.servingSize} g`, grams: f.servingSize }
            : undefined,
      }
    })
    .filter((x): x is FoodMatch => x !== null)
}

// ── Open Food Facts ────────────────────────────────────────────────

interface OffProduct {
  product_name?: string
  brands?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return isFinite(n) ? n : null
}

export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<FoodMatch[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=5` +
    `&fields=product_name,brands,nutriments,serving_size,serving_quantity`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { products?: OffProduct[] }
  return (data.products ?? [])
    .map((p): FoodMatch | null => {
      const n = p.nutriments ?? {}
      let kcal = num(n['energy-kcal_100g'])
      if (kcal == null) {
        const kj = num(n['energy_100g'])
        kcal = kj != null ? kj / 4.184 : null
      }
      if (kcal == null || !p.product_name) return null
      const grams = num(p.serving_quantity) ?? parseGrams(p.serving_size)
      return {
        name: p.product_name.trim(),
        brand: p.brands?.split(',')[0]?.trim() || undefined,
        source: 'openfoodfacts',
        per100g: {
          kcal: Math.round(kcal),
          protein: round(num(n['proteins_100g']) ?? 0),
          carbs: round(num(n['carbohydrates_100g']) ?? 0),
          fat: round(num(n['fat_100g']) ?? 0),
        },
        serving: grams ? { label: p.serving_size || `${grams} g`, grams } : undefined,
      }
    })
    .filter((x): x is FoodMatch => x !== null)
}

// ── The combined lookup ────────────────────────────────────────────

/**
 * Search every source in parallel and return ranked candidates.
 * Local first (hand-checked), then whichever remote source the query
 * shape favours: a brand-looking query leans on Open Food Facts, a plain
 * ingredient leans on USDA.
 */
export async function findFood(query: string, usdaKey = ''): Promise<FoodMatch[]> {
  const q = query.trim()
  if (!q) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 11_000)

  try {
    const [usda, off] = await Promise.all([
      searchUsda(q, usdaKey, controller.signal).catch(() => []),
      searchOpenFoodFacts(q, controller.signal).catch(() => []),
    ])
    const local = localMatches(q)

    // A capitalised word or a digit in the query usually means a product.
    const brandish = /[0-9]|\b[A-Z][a-z]{2,}\b/.test(query)
    const remote = brandish ? [...off, ...usda] : [...usda, ...off]

    const seen = new Set<string>()
    const out: FoodMatch[] = []
    for (const m of [...local, ...remote]) {
      const key = `${m.brand ?? ''}|${m.name}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(m)
    }
    return out.slice(0, 6)
  } finally {
    clearTimeout(timeout)
  }
}

/** Compact text rendering for a model's tool result. */
export function formatMatches(matches: FoodMatch[], grams?: number): string {
  if (!matches.length) {
    return 'No database match. Estimate from your own knowledge, say clearly that it is an estimate, and log it anyway.'
  }
  const label = { local: 'curated', usda: 'USDA', openfoodfacts: 'Open Food Facts' }
  return matches
    .map((m, i) => {
      const head = `[${i + 1}] ${m.brand ? `${m.brand} — ` : ''}${m.name} (${label[m.source]})`
      const p = m.per100g
      const per100 = `per 100g: ${p.kcal} kcal, ${p.protein}g protein, ${p.carbs}g carbs, ${p.fat}g fat`
      const serve = m.serving ? ` · serving ${m.serving.label} = ${m.serving.grams} g` : ''
      if (grams) {
        const s = scaleTo(m, grams)
        return `${head}\n  ${per100}${serve}\n  → ${grams} g = ${s.kcal} kcal, ${s.protein}g protein, ${s.carbs}g carbs, ${s.fat}g fat`
      }
      return `${head}\n  ${per100}${serve}`
    })
    .join('\n')
}

/** How many staples the curated table covers — surfaced in Settings. */
export const LOCAL_FOOD_COUNT = FOOD_DB.length
