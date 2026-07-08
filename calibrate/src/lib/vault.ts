import { useStore } from '../store/store'
import type { Note } from '../store/types'

// ————————————————————————————————————————————————————————
// VAULT — the Obsidian-style layer on top of plain notes.
// Tags (#tag) and wiki-links ([[Title]]) live inside the markdown body,
// so no schema migration is needed and everything syncs as-is.
// This module parses that structure and ranks notes for Jarvis retrieval.
// ————————————————————————————————————————————————————————

const TAG_RE = /(^|\s)#([a-z0-9][\w/-]*)/gi
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g

export function extractTags(body: string): string[] {
  const out = new Set<string>()
  for (const m of body.matchAll(TAG_RE)) out.add(m[2].toLowerCase())
  return [...out]
}

export function extractWikiLinks(body: string): string[] {
  const out = new Set<string>()
  for (const m of body.matchAll(WIKILINK_RE)) out.add(m[1].trim())
  return [...out]
}

export function allVaultTags(notes: Note[]): string[] {
  const counts = new Map<string, number>()
  for (const n of notes) for (const t of extractTags(n.body)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
}

/** Exact-ish title match used to resolve [[wiki-links]]. */
export function findNoteByTitle(notes: Note[], title: string): Note | undefined {
  const q = title.trim().toLowerCase()
  return notes.find((n) => n.title.trim().toLowerCase() === q) ?? notes.find((n) => n.title.toLowerCase().includes(q))
}

/** Notes whose body links to the given note's title. */
export function backlinksFor(notes: Note[], note: Note): Note[] {
  const target = note.title.trim().toLowerCase()
  if (!target) return []
  return notes.filter(
    (n) => n.id !== note.id && extractWikiLinks(n.body).some((l) => l.trim().toLowerCase() === target),
  )
}

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'for', 'my', 'me', 'i', 'in', 'on', 'it', 'do', 'you', 'what', 'how'])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/** Full-text search for the Vault UI: matches title, tags, then body. */
export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase()
  if (!q) return notes
  const qTokens = tokens(q)
  return notes
    .map((n) => {
      const title = n.title.toLowerCase()
      const body = n.body.toLowerCase()
      let score = 0
      if (title.includes(q)) score += 6
      if (extractTags(n.body).some((t) => t.includes(q.replace(/^#/, '')))) score += 4
      for (const t of qTokens) {
        if (title.includes(t)) score += 2
        if (body.includes(t)) score += 1
      }
      return { n, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.n.updated - a.n.updated)
    .map((x) => x.n)
}

/**
 * Retrieval for Jarvis: the notes most relevant to the current query,
 * scored by token overlap (title weighted over body) + tag hits + recency.
 * Returns [] when nothing meaningfully matches so callers skip the section.
 */
export function retrieveRelevantNotes(query: string, limit = 3): Note[] {
  const notes = useStore.getState().notes
  if (!notes.length || !query.trim()) return []

  const qTokens = tokens(query)
  if (!qTokens.length) return []
  const now = Date.now()

  return notes
    .map((n) => {
      const titleTokens = tokens(n.title)
      const bodyTokens = new Set(tokens(n.body))
      const noteTags = extractTags(n.body)
      let score = 0
      for (const t of qTokens) {
        if (titleTokens.includes(t)) score += 3
        else if (bodyTokens.has(t)) score += 1
        if (noteTags.includes(t)) score += 2
      }
      const ageDays = (now - n.updated) / 86_400_000
      score += Math.max(0, 1 - ageDays / 60) * 0.5
      if (n.pinned) score += 0.5
      return { n, score }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.n)
}

/** Compact excerpt of a note for prompt injection. */
export function noteExcerpt(note: Note, maxChars = 600): string {
  const body = note.body.trim()
  const text = body.length > maxChars ? body.slice(0, maxChars).trimEnd() + ' …[truncated]' : body
  return `“${note.title}”${note.pinned ? ' (pinned)' : ''}:\n${text || '(empty)'}`
}
