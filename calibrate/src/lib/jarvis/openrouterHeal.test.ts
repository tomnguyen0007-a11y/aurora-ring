import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverOpenRouterFreeModel } from './llm'

function mockCatalogue(models: { id: string; vision?: boolean }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: models.map((m) => ({
          id: m.id,
          architecture: { input_modalities: m.vision ? ['text', 'image'] : ['text'] },
        })),
      }),
    })),
  )
}

describe('OpenRouter self-healing model discovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('prefers a curated model that is still live', async () => {
    mockCatalogue([
      { id: 'some/random-13b:free' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free' },
      { id: 'paid/model-9000' },
    ])
    expect(await discoverOpenRouterFreeModel(false)).toBe('meta-llama/llama-3.3-70b-instruct:free')
  })

  it('only picks vision-capable free models when the request needs vision', async () => {
    mockCatalogue([
      { id: 'meta-llama/llama-3.3-70b-instruct:free' }, // text-only, curated
      { id: 'google/gemma-3-27b-it:free', vision: true }, // vision, curated
    ])
    expect(await discoverOpenRouterFreeModel(true)).toBe('google/gemma-3-27b-it:free')
  })

  it('falls back to the largest uncurated free model when no curated one survives', async () => {
    mockCatalogue([
      { id: 'newvendor/tiny-7b:free' },
      { id: 'newvendor/huge-120b:free' },
      { id: 'newvendor/mid-32b:free' },
    ])
    expect(await discoverOpenRouterFreeModel(false)).toBe('newvendor/huge-120b:free')
  })

  it('never returns a paid model', async () => {
    mockCatalogue([{ id: 'anthropic/claude-sonnet-5' }, { id: 'openai/gpt-5' }])
    expect(await discoverOpenRouterFreeModel(false)).toBeNull()
  })

  it('returns null when the catalogue fetch fails (offline / blocked)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    expect(await discoverOpenRouterFreeModel(false)).toBeNull()
  })
})
