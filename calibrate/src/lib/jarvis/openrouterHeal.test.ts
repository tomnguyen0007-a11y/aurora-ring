import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../store/store'
import { discoverOpenRouterFreeModel, testProvider } from './llm'

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

describe('OpenRouter connection test — auth vs. dead-model diagnosis', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useStore.setState({ settings: { ...useStore.getState().settings, openrouterKey: '', openrouterModel: 'qwen/qwen2.5-vl-72b-instruct:free' } })
  })

  it('reports a bad key distinctly (401) instead of running the whole heal dance', async () => {
    useStore.getState().setSettings({ provider: 'openrouter', openrouterKey: 'bad-key' })
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        return new Response('unauthorized', { status: 401 })
      }),
    )
    const res = await testProvider('openrouter')
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/rejected this key.*401/)
    // Must not brute-force the curated model list against a key we already know is bad
    expect(calls.length).toBe(1)
  })

  it('still heals past a genuinely retired model (404) instead of reporting an auth error', async () => {
    useStore.getState().setSettings({ provider: 'openrouter', openrouterKey: 'good-key', openrouterModel: 'some/retired-model:free' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/models')) return new Response(JSON.stringify({ data: [] }), { status: 200 })
        const body = JSON.parse(String(init?.body ?? '{}'))
        if (body.model === 'some/retired-model:free') return new Response('not found', { status: 404 })
        if (body.model === 'meta-llama/llama-3.3-70b-instruct:free') return new Response('{}', { status: 200 })
        return new Response('not found', { status: 404 })
      }),
    )
    const res = await testProvider('openrouter')
    expect(res.ok).toBe(true)
    expect(res.message).toContain('auto-switched to meta-llama/llama-3.3-70b-instruct:free')
  })
})
