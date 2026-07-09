// ————————————————————————————————————————————————————————
// GITHUB KNOWLEDGE SYNC
// Pulls markdown/text straight from a GitHub repo (an Obsidian vault pushed to
// GitHub, the ECC skills repo, project docs — anything) into the Brain Feed,
// so Jarvis reasons from it like any other imported note. No server: this
// calls the GitHub REST API directly from the browser with the user's own
// token (or anonymously for public repos), same trust model as every other
// provider key in Settings.
// ————————————————————————————————————————————————————————

import { useStore } from '../../store/store'

const SOURCE_PREFIX = (repo: string) => `github:${repo}:`

/** Files worth reading as knowledge — skip binaries, lockfiles, images, etc. */
const TEXT_EXT = /\.(md|mdx|markdown|txt)$/i

/** Hard caps so one huge repo can't blow the Brain Feed budget or hang the browser. */
const MAX_FILES = 40
const MAX_TOTAL_CHARS = 60_000

interface GitTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

function authHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/vnd.github+json' }
  if (token) h.authorization = `Bearer ${token}`
  return h
}

/** Decode a GitHub contents-API base64 payload as proper UTF-8 text. */
function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export interface GithubSyncResult {
  ok: boolean
  message: string
}

/**
 * Sync now: fetch the repo's file tree, pick text/markdown files under the
 * configured path, fetch their content, and replace whatever this repo
 * synced last time in knowledgeDocs with the fresh set.
 */
export async function syncGithubKnowledge(): Promise<GithubSyncResult> {
  const { settings, knowledgeDocs, addKnowledgeDoc, removeKnowledgeDoc, setSettings } = useStore.getState()
  const repo = settings.githubRepo?.trim()
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return { ok: false, message: 'Enter a repo as "owner/repo" first.' }
  }
  const branch = settings.githubBranch?.trim() || 'main'
  const pathFilter = settings.githubPath?.trim().replace(/^\/+|\/+$/g, '') ?? ''
  const token = settings.githubToken?.trim()

  try {
    const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
      headers: authHeaders(token),
    })
    if (!treeRes.ok) {
      if (treeRes.status === 404) return { ok: false, message: `"${repo}" or branch "${branch}" not found — check spelling, or add a token if it's private.` }
      if (treeRes.status === 403) return { ok: false, message: 'GitHub rate-limited or forbidden — add a personal access token to sync more often / private repos.' }
      return { ok: false, message: `GitHub error ${treeRes.status} fetching the file tree.` }
    }
    const tree: { tree?: GitTreeEntry[]; truncated?: boolean } = await treeRes.json()
    const candidates = (tree.tree ?? [])
      .filter((e) => e.type === 'blob' && TEXT_EXT.test(e.path))
      .filter((e) => !pathFilter || e.path === pathFilter || e.path.startsWith(pathFilter + '/'))
      .slice(0, MAX_FILES)

    if (!candidates.length) {
      return { ok: false, message: pathFilter ? `No .md/.txt files found under "${pathFilter}".` : 'No .md/.txt files found in this repo.' }
    }

    let used = 0
    const fetched: { path: string; body: string }[] = []
    for (const entry of candidates) {
      if (used >= MAX_TOTAL_CHARS) break
      const fileRes = await fetch(`https://api.github.com/repos/${repo}/contents/${entry.path}?ref=${encodeURIComponent(branch)}`, {
        headers: authHeaders(token),
      })
      if (!fileRes.ok) continue
      const file: { content?: string; encoding?: string } = await fileRes.json()
      if (!file.content || file.encoding !== 'base64') continue
      const text = decodeBase64Utf8(file.content)
      const remaining = MAX_TOTAL_CHARS - used
      const body = text.length > remaining ? text.slice(0, remaining) + '\n…[truncated]' : text
      used += body.length
      fetched.push({ path: entry.path, body })
    }

    if (!fetched.length) return { ok: false, message: 'Found matching files but none could be read — check the token has repo access.' }

    // Drop whatever this repo contributed last sync, then add the fresh set.
    const prefix = SOURCE_PREFIX(repo)
    for (const d of knowledgeDocs) {
      if (d.source.startsWith(prefix)) removeKnowledgeDoc(d.id)
    }
    for (const f of fetched) {
      addKnowledgeDoc(f.path.split('/').pop()?.replace(TEXT_EXT, '') || f.path, f.body, `${prefix}${f.path}`)
    }

    setSettings({ githubSyncedAt: Date.now() })
    const truncatedNote = tree.truncated ? ' (repo tree was large — GitHub truncated the listing, so some files may be missing)' : ''
    return { ok: true, message: `Synced ${fetched.length} file${fetched.length === 1 ? '' : 's'} from ${repo}@${branch}${truncatedNote}.` }
  } catch {
    return { ok: false, message: 'Network error reaching GitHub — check your connection and try again.' }
  }
}
