import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../store/store'
import { syncGithubKnowledge } from './githubSync'

function reset() {
  useStore.setState({ knowledgeDocs: [], settings: { ...useStore.getState().settings, githubRepo: '', githubBranch: 'main', githubPath: '', githubToken: '', githubSyncedAt: 0 } })
  vi.unstubAllGlobals()
}

/** Base64-encode UTF-8 text the way GitHub's contents API would (arbitrary Unicode, not just Latin1). */
function toGithubBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.includes(pattern)) return handler()
      }
      throw new Error(`unmocked fetch: ${url}`)
    }),
  )
}

describe('GitHub knowledge sync', () => {
  afterEach(reset)

  it('rejects a missing/malformed repo before hitting the network', async () => {
    const res = await syncGithubKnowledge()
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/owner\/repo/)
  })

  it('fetches the tree, filters to text files, decodes UTF-8 content, and injects into knowledgeDocs', async () => {
    useStore.getState().setSettings({ githubRepo: 'tom/vault', githubBranch: 'main' })
    mockFetch({
      '/git/trees/main': () =>
        new Response(
          JSON.stringify({
            tree: [
              { path: 'notes/training.md', type: 'blob' },
              { path: 'notes/image.png', type: 'blob' },
              { path: 'notes/sub', type: 'tree' },
            ],
          }),
          { status: 200 },
        ),
      'notes/training.md': () =>
        new Response(JSON.stringify({ content: toGithubBase64('Zone 2 easy — café ☕ session, naïve pace 🏃'), encoding: 'base64' }), { status: 200 }),
    })

    const res = await syncGithubKnowledge()
    expect(res.ok).toBe(true)
    expect(res.message).toContain('Synced 1 file')

    const docs = useStore.getState().knowledgeDocs
    expect(docs).toHaveLength(1)
    expect(docs[0].source).toBe('github:tom/vault:notes/training.md')
    expect(docs[0].body).toContain('café ☕ session, naïve pace 🏃') // proves UTF-8 decode is correct, not mangled Latin1
  })

  it('replaces the previous sync from the same repo instead of duplicating', async () => {
    useStore.getState().setSettings({ githubRepo: 'tom/vault', githubBranch: 'main' })
    mockFetch({
      '/git/trees/main': () => new Response(JSON.stringify({ tree: [{ path: 'a.md', type: 'blob' }] }), { status: 200 }),
      'a.md': () => new Response(JSON.stringify({ content: toGithubBase64('version one'), encoding: 'base64' }), { status: 200 }),
    })
    await syncGithubKnowledge()
    expect(useStore.getState().knowledgeDocs).toHaveLength(1)

    mockFetch({
      '/git/trees/main': () => new Response(JSON.stringify({ tree: [{ path: 'a.md', type: 'blob' }] }), { status: 200 }),
      'a.md': () => new Response(JSON.stringify({ content: toGithubBase64('version two'), encoding: 'base64' }), { status: 200 }),
    })
    await syncGithubKnowledge()

    const docs = useStore.getState().knowledgeDocs
    expect(docs).toHaveLength(1)
    expect(docs[0].body).toBe('version two')
  })

  it('reports a clear message on 404 (bad repo/branch) without throwing', async () => {
    useStore.getState().setSettings({ githubRepo: 'tom/does-not-exist', githubBranch: 'main' })
    mockFetch({ '/git/trees/main': () => new Response('', { status: 404 }) })
    const res = await syncGithubKnowledge()
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/not found/)
  })

  it('respects an optional path filter', async () => {
    useStore.getState().setSettings({ githubRepo: 'tom/vault', githubBranch: 'main', githubPath: 'skills' })
    mockFetch({
      '/git/trees/main': () =>
        new Response(
          JSON.stringify({
            tree: [
              { path: 'skills/foo.md', type: 'blob' },
              { path: 'other/bar.md', type: 'blob' },
            ],
          }),
          { status: 200 },
        ),
      'skills/foo.md': () => new Response(JSON.stringify({ content: toGithubBase64('in scope'), encoding: 'base64' }), { status: 200 }),
    })
    const res = await syncGithubKnowledge()
    expect(res.ok).toBe(true)
    const docs = useStore.getState().knowledgeDocs
    expect(docs).toHaveLength(1)
    expect(docs[0].source).toContain('skills/foo.md')
  })
})
