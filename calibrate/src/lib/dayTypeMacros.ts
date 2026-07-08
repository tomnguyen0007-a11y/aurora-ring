/** Parse a "g/kg/day" figure that may be a single value ("4.5") or a range ("3.5-4.5" / "3.5–4.5"). */
export function parseGkgRange(raw: string): { low: number; high: number; mid: number } {
  const parts = raw
    .replace(/–|—/g, '-')
    .split('-')
    .map((p) => parseFloat(p.trim()))
    .filter((n) => !Number.isNaN(n))

  if (parts.length >= 2) {
    const [low, high] = parts
    return { low, high, mid: (low + high) / 2 }
  }
  const v = parts[0] ?? 0
  return { low: v, high: v, mid: v }
}

/**
 * The reference example column: grams + kcal at a given bodyweight, using the
 * midpoint of each g/kg range (4 kcal/g protein & carbs, 9 kcal/g fat).
 * Recomputed on every edit so the figure can never drift out of sync with
 * the actual protein/carb/fat targets it's illustrating.
 */
export function computeExample80kg(proteinGkg: string, carbGkg: string, fatGkg: string, weightKg = 80): string {
  const p = Math.round(parseGkgRange(proteinGkg).mid * weightKg)
  const c = Math.round(parseGkgRange(carbGkg).mid * weightKg)
  const f = Math.round(parseGkgRange(fatGkg).mid * weightKg)
  const kcal = Math.round(p * 4 + c * 4 + f * 9)
  return `P${p} C${c} F${f} ≈ ${kcal} kcal`
}
