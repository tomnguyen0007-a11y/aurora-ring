import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../store/store'
import { applyActions } from './actions'
import { lookupFood } from './foodDb'
import { enrichLogFoodActions, parseGrams, resolveNutrition, tryLocalFoodLog } from './nutrition'

function offResponse(products: unknown[]) {
  return new Response(JSON.stringify({ products }), { status: 200 })
}

describe('deterministic nutrition resolution — data over model guesses', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useStore.setState({ foodLogs: [] })
  })

  it('parseGrams reads portions, not calories', () => {
    expect(parseGrams('150 g of white greek yogurt')).toBe(150)
    expect(parseGrams('greek yogurt 150g')).toBe(150)
    expect(parseGrams('200ml milk')).toBe(200)
    expect(parseGrams('chicken bowl 750 kcal')).toBeNull()
  })

  it('scales a local-DB hit to the stated portion (150g greek yogurt ≈ 88 kcal, not 100)', async () => {
    const hit = await resolveNutrition('greek yogurt', 150)
    expect(hit).not.toBeNull()
    expect(hit!.source).toBe('food database')
    expect(hit!.kcal).toBe(88) // 100 kcal per 170g serving → 150g
    expect(hit!.protein).toBe(15) // 17g → 15g
  })

  it('falls back to Open Food Facts real label data, scaled per 100g', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        offResponse([
          { product_name: 'No data product', nutriments: {} },
          { product_name: 'Milka Chocolate Pudding', nutriments: { 'energy-kcal_100g': 120, proteins_100g: 3.5, carbohydrates_100g: 18, fat_100g: 4 } },
        ]),
      ),
    )
    const hit = await resolveNutrition('milka chocolate pudding', 200)
    expect(hit).not.toBeNull()
    expect(hit!.source).toBe('Open Food Facts')
    expect(hit!.kcal).toBe(240) // 120/100g × 200g
    expect(hit!.protein).toBe(7)
  })

  it('returns null instead of inventing numbers when both sources miss', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await resolveNutrition('grandmas mystery casserole')).toBeNull()
  })

  it('enrichLogFoodActions fills blanks from data but never overrides user/model-stated macros', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse([])))
    const out = await enrichLogFoodActions([
      { type: 'log_food', name: 'greek yogurt', portionGrams: 150 },
      { type: 'log_food', name: 'chicken wrap', kcal: 650, protein: 40 },
    ])
    expect(out[0]).toMatchObject({ kcal: 88, protein: 15 })
    expect(out[1]).toMatchObject({ kcal: 650, protein: 40 }) // untouched
  })

  it('applyActions refuses a log_food with no resolvable macros instead of writing a 0-kcal entry', () => {
    const receipts = applyActions([{ type: 'log_food', name: 'grandmas mystery casserole' }])
    expect(useStore.getState().foodLogs).toHaveLength(0)
    expect(receipts[0]).toMatch(/couldn't verify macros/i)
  })

  it('lookupFood is order-free and misspelling-tolerant ("150 g of white yougurt greek")', () => {
    const hit = lookupFood('150 g of white yougurt greek')
    expect(hit).not.toBeNull()
    expect(hit!.aliases[0]).toBe('greek yogurt')
    expect(lookupFood('instaant chocolate poridge with hot water')?.aliases[0]).toBe('chocolate porridge')
  })

  it('NO-MODEL PATH: the exact reported message logs two accurate entries with zero LLM', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse([]))) // OFF not even needed — DB covers both
    const res = await tryLocalFoodLog('log in a instaant chocolate poridge with hot water, and then 150 g of white yougurt greek')
    expect(res).not.toBeNull()
    const logs = useStore.getState().foodLogs
    expect(logs).toHaveLength(2)
    expect(logs.find((f) => f.name.includes('porridge'))).toMatchObject({ kcal: 210 })
    expect(logs.find((f) => f.name.includes('yogurt'))).toMatchObject({ kcal: 88 })
    expect(res!.reply).toContain('Fuel logged from real data')
  })

  it('NO-MODEL PATH: unknown branded item resolves via Open Food Facts with a relevance guard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        offResponse([{ product_name: 'Snickers Bar', nutriments: { 'energy-kcal_100g': 488, proteins_100g: 8.5, carbohydrates_100g: 60, fat_100g: 24 } }]),
      ),
    )
    const res = await tryLocalFoodLog('log a snickers 50g')
    expect(res).not.toBeNull()
    expect(useStore.getState().foodLogs[0]).toMatchObject({ kcal: 244 }) // 488 × 0.5
  })

  it('NO-MODEL PATH: bails to the LLM rather than half-logging ("chicken and rice" = two foods)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse([])))
    expect(await tryLocalFoodLog('had chicken breast and rice')).toBeNull()
    expect(useStore.getState().foodLogs).toHaveLength(0)
  })

  it('NO-MODEL PATH: never hijacks non-food messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse([])))
    expect(await tryLocalFoodLog('log a note about my swing thoughts')).toBeNull()
    expect(await tryLocalFoodLog('log 45 min run')).toBeNull()
    expect(await tryLocalFoodLog('remember that I prefer morning workouts')).toBeNull()
  })

  it('the reported failure end-to-end: porridge + 150g yogurt become two accurate entries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse([])))
    // What a weak model SHOULD emit under the new policy: names + portions, no macros
    const enriched = await enrichLogFoodActions([
      { type: 'log_food', name: 'instant chocolate porridge' },
      { type: 'log_food', name: 'greek yogurt', portionGrams: 150 },
    ])
    const receipts = applyActions(enriched)
    const logs = useStore.getState().foodLogs
    expect(logs).toHaveLength(2)
    expect(logs.find((f) => f.name.includes('porridge'))).toMatchObject({ kcal: 210 })
    expect(logs.find((f) => f.name.includes('yogurt'))).toMatchObject({ kcal: 88 })
    expect(receipts.join(' ')).toContain('food database')
  })
})
