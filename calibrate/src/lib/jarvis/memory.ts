import { useStore } from '../../store/store'
import type { MemoryFact } from '../../store/types'

export { inferCategory, inferImportance } from './memoryCategorize'

// ————————————————————————————————————————————————————————
// SEMANTIC MEMORY RETRIEVAL
// Facts persist in the Zustand store (src/store/store.ts, profile.facts),
// so they survive reloads and sync the same way the rest of the app data does.
// This module is purely the scoring/retrieval layer on top of that store.
// ————————————————————————————————————————————————————————

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'for', 'my', 'me', 'i'])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * Semantic relevance score: token overlap between the query and a fact,
 * boosted by recency, user-marked importance, and how often it's been surfaced.
 */
export function scoreMemoryRelevance(fact: MemoryFact, query: string, now: number = Date.now()): number {
  const queryTokens = tokens(query)
  const factTokens = tokens(fact.text)
  const overlap = queryTokens.filter((t) => factTokens.includes(t)).length

  const ageDays = (now - fact.lastAccessed) / (1000 * 60 * 60 * 24)
  const recencyScore = Math.max(0, 1 - ageDays / 30)

  const importanceBoost = fact.importance >= 8 ? 0.4 : fact.importance >= 6 ? 0.2 : 0
  const frequencyBoost = Math.min(0.2, fact.accessCount * 0.02)

  return overlap + recencyScore * 0.5 + importanceBoost + frequencyBoost
}

/**
 * Retrieve the facts most relevant to a query, ranked by semantic score.
 * Returns [] if the query has no meaningful overlap with anything stored —
 * callers should not inject an empty/noisy memory section in that case.
 */
export function retrieveRelevantMemories(query: string, limit = 5): MemoryFact[] {
  const facts = useStore.getState().profile.facts
  if (!facts.length || !query.trim()) return []

  const now = Date.now()
  return facts
    .map((f) => ({ fact: f, score: scoreMemoryRelevance(f, query, now) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.fact)
}

/** Mark facts as accessed — keeps frequently-useful memories surfacing more readily. */
export function touchMemories(ids: string[]): void {
  if (!ids.length) return
  useStore.setState((s) => ({
    profile: {
      ...s.profile,
      facts: s.profile.facts.map((f) =>
        ids.includes(f.id) ? { ...f, lastAccessed: Date.now(), accessCount: f.accessCount + 1 } : f,
      ),
    },
  }))
}

/** Format retrieved facts for LLM/local-engine injection, grouped by category. */
export function formatMemoriesForPrompt(facts: MemoryFact[]): string {
  if (!facts.length) return ''

  const grouped = facts.reduce<Record<string, MemoryFact[]>>((acc, f) => {
    ;(acc[f.category] ??= []).push(f)
    return acc
  }, {})

  const sections = Object.entries(grouped).map(
    ([cat, items]) => `${cat.toUpperCase()}:\n${items.map((f) => `  • ${f.text}`).join('\n')}`,
  )

  return sections.join('\n\n')
}
