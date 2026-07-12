// ————————————————————————————————————————————————————————
// LOCAL FOOD NUTRITION DATABASE (anti-hallucination)
// Common items with real per-serving macros, so Jarvis logs food from actual
// data instead of inventing plausible-sounding numbers. Values are typical
// label figures for the stated serving — close enough to log against, but
// callers should still flag them as estimates rather than exact facts.
// ————————————————————————————————————————————————————————

export interface FoodFact {
  aliases: string[] // lowercase match terms, longest/most-specific first
  serving: string
  /** grams in one serving — lets callers scale macros to a stated portion ("150g yogurt") */
  gramsPerServing?: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const FOOD_DB: FoodFact[] = [
  { aliases: ['whey protein shake', 'protein shake', 'whey shake', 'whey scoop', 'protein powder', 'whey protein'], gramsPerServing: 30, serving: '1 scoop (~30g) in water/milk', kcal: 120, protein: 24, carbs: 3, fat: 1.5 },
  { aliases: ['mass gainer shake', 'mass gainer'], gramsPerServing: 100, serving: '1 serving', kcal: 650, protein: 50, carbs: 90, fat: 8 },
  { aliases: ['banana'], gramsPerServing: 118, serving: '1 medium (118g)', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { aliases: ['apple'], gramsPerServing: 182, serving: '1 medium (182g)', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { aliases: ['whole egg', 'egg', 'boiled egg', 'fried egg'], gramsPerServing: 50, serving: '1 large egg', kcal: 72, protein: 6.3, carbs: 0.4, fat: 5 },
  { aliases: ['egg white', 'egg whites'], gramsPerServing: 33, serving: '1 large white', kcal: 17, protein: 3.6, carbs: 0.2, fat: 0.1 },
  { aliases: ['chicken breast', 'grilled chicken', 'chicken breast cooked'], gramsPerServing: 100, serving: '100g cooked', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { aliases: ['white rice cooked', 'cooked rice', 'white rice', 'rice'], gramsPerServing: 158, serving: '1 cup cooked (158g)', kcal: 205, protein: 4.3, carbs: 45, fat: 0.4 },
  { aliases: ['brown rice'], gramsPerServing: 195, serving: '1 cup cooked (195g)', kcal: 216, protein: 5, carbs: 45, fat: 1.8 },
  { aliases: ['oats', 'oatmeal', 'rolled oats'], gramsPerServing: 40, serving: '1/2 cup dry (40g)', kcal: 150, protein: 5, carbs: 27, fat: 3 },
  { aliases: ['chocolate porridge', 'instant chocolate porridge', 'instant porridge', 'choc porridge'], gramsPerServing: 55, serving: '1 sachet (~55g) made with water', kcal: 210, protein: 6, carbs: 37, fat: 4 },
  // 'yougurt' included deliberately — the common misspelling must still hit the DB
  { aliases: ['greek yogurt', 'greek yoghurt', 'greek yougurt', 'white yogurt greek', 'yogurt greek', 'skyr'], gramsPerServing: 170, serving: '170g plain 0-2% fat', kcal: 100, protein: 17, carbs: 6, fat: 0.5 },
  { aliases: ['whole milk'], gramsPerServing: 244, serving: '1 cup (244g)', kcal: 149, protein: 8, carbs: 12, fat: 8 },
  { aliases: ['skim milk', 'skimmed milk'], gramsPerServing: 245, serving: '1 cup (245g)', kcal: 83, protein: 8.3, carbs: 12, fat: 0.2 },
  { aliases: ['almonds'], gramsPerServing: 28, serving: '28g (~23 almonds)', kcal: 164, protein: 6, carbs: 6, fat: 14 },
  { aliases: ['peanut butter'], gramsPerServing: 32, serving: '2 tbsp (32g)', kcal: 188, protein: 8, carbs: 6, fat: 16 },
  { aliases: ['salmon', 'salmon fillet'], gramsPerServing: 100, serving: '100g cooked', kcal: 208, protein: 22, carbs: 0, fat: 13 },
  { aliases: ['sweet potato'], gramsPerServing: 114, serving: '1 medium baked (114g)', kcal: 103, protein: 2.3, carbs: 24, fat: 0.2 },
  { aliases: ['avocado'], gramsPerServing: 68, serving: '1/2 medium (68g)', kcal: 114, protein: 1.3, carbs: 6, fat: 10.5 },
  { aliases: ['cottage cheese'], gramsPerServing: 113, serving: '1/2 cup (113g)', kcal: 90, protein: 12, carbs: 4, fat: 2.5 },
  { aliases: ['tuna', 'canned tuna'], gramsPerServing: 142, serving: '1 can drained (142g)', kcal: 128, protein: 29, carbs: 0, fat: 1 },
  { aliases: ['broccoli'], gramsPerServing: 156, serving: '1 cup cooked (156g)', kcal: 55, protein: 3.7, carbs: 11, fat: 0.6 },
  { aliases: ['creatine'], gramsPerServing: 5, serving: '5g', kcal: 0, protein: 0, carbs: 0, fat: 0 },
]

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(a|an|the|some|my|of|with|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Look up known macros for a food by name. Matches on substring against
 * aliases (longest alias wins first, so "protein shake" beats bare "shake").
 * Returns null if nothing in the local DB matches — callers must NOT invent
 * numbers in that case; ask the user for the label instead.
 */
export function lookupFood(name: string): (FoodFact & { matchedAlias: string }) | null {
  const n = normalize(name)
  if (!n) return null

  let best: { fact: FoodFact; alias: string } | null = null
  for (const fact of FOOD_DB) {
    for (const alias of fact.aliases) {
      if (n.includes(alias) || alias.includes(n)) {
        if (!best || alias.length > best.alias.length) best = { fact, alias }
      }
    }
  }

  return best ? { ...best.fact, matchedAlias: best.alias } : null
}

/** Formatted reference table injected into Jarvis's grounded knowledge. */
export function foodDbForPrompt(): string {
  const rows = FOOD_DB.map(
    (f) => `  • ${f.aliases[0]} (${f.serving}): ${f.kcal} kcal, ${f.protein}g protein, ${f.carbs}g carbs, ${f.fat}g fat`,
  )
  return `KNOWN FOOD DATABASE (use these exact figures when the item matches — never invent different numbers for these items):\n${rows.join('\n')}\nFor any food NOT in this list: emit log_food with the clean item name and portionGrams but NO kcal/macros — the app resolves real label figures automatically (local DB scaled to portion, then the Open Food Facts database). Only supply macros yourself when the user stated them or you verified a real label via web search.`
}
