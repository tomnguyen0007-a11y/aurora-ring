/**
 * MEMORY UPGRADE (Phase 3) - SEMANTIC RETRIEVAL
 * 
 * Enhances the memory system from simple key-value storage to semantic-relevant retrieval.
 * Provides structured memory objects with relevance scoring.
 * Automatically injected into every LLM prompt when relevant.
 */

export type MemoryCategory = 'golf' | 'fitness' | 'nutrition' | 'life' | 'business' | 'recovery'

export interface MemoryEntry {
  id: string
  category: MemoryCategory
  content: string
  importance: number // 1-10
  timestamp: number // creation time
  lastAccessed: number // updated when retrieved
  accessCount: number // tracks how often this memory is used
}

/**
 * Semantic relevance score calculation.
 * Combines:
 * - Token overlap between query and memory content
 * - Recency (newer memories weighted higher)
 * - Importance flag (user-marked important memories boost score)
 * - Frequency of use (often-accessed memories stay relevant)
 */
export function scoreMemoryRelevance(
  memory: MemoryEntry,
  query: string,
  now: number = Date.now(),
): number {
  const queryTokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 1)
  const contentTokens = memory.content.toLowerCase().split(/\W+/).filter((t) => t.length > 1)

  // Token overlap: count matching words
  const tokenOverlap = queryTokens.filter((t) => contentTokens.includes(t)).length

  // Recency weight: memories used recently stay more relevant
  // Decay over 30 days
  const ageMs = now - memory.lastAccessed
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  const recencyScore = Math.max(0, 1 - ageDays / 30)

  // Importance boost: high-importance memories (7+) get stronger signal
  const importanceBoost = memory.importance >= 7 ? 0.3 : memory.importance >= 5 ? 0.15 : 0

  // Frequency boost: memories accessed often stay relevant
  const frequencyBoost = Math.min(0.2, memory.accessCount * 0.02)

  return tokenOverlap + recencyScore * 0.5 + importanceBoost + frequencyBoost
}

/**
 * Simple in-memory cache for memories.
 * In production, this would read from Supabase.
 */
class MemoryCache {
  private memories: Map<string, MemoryEntry> = new Map()

  add(entry: MemoryEntry): void {
    this.memories.set(entry.id, entry)
  }

  retrieve(category?: MemoryCategory): MemoryEntry[] {
    const all = Array.from(this.memories.values())
    return category ? all.filter((m) => m.category === category) : all
  }

  search(query: string, category?: MemoryCategory, limit = 5): MemoryEntry[] {
    const candidates = this.retrieve(category)
    const scored = candidates.map((m) => ({
      memory: m,
      score: scoreMemoryRelevance(m, query),
    }))

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.memory)
  }

  updateAccess(id: string): void {
    const mem = this.memories.get(id)
    if (mem) {
      mem.lastAccessed = Date.now()
      mem.accessCount += 1
    }
  }
}

// Global instance (will be replaced by Supabase middleware in Phase 4)
let cache = new MemoryCache()

/**
 * Public API for memory management
 */
export const MemorySystem = {
  /**
   * Add a new memory entry
   */
  add(id: string, category: MemoryCategory, content: string, importance = 5): void {
    const now = Date.now()
    cache.add({
      id,
      category,
      content,
      importance,
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
    })
  },

  /**
   * Search for relevant memories by query
   */
  search(query: string, category?: MemoryCategory, limit = 5): MemoryEntry[] {
    return cache.search(query, category, limit)
  },

  /**
   * Get all memories in a category
   */
  getByCategory(category: MemoryCategory): MemoryEntry[] {
    return cache.retrieve(category)
  },

  /**
   * Mark a memory as accessed (updates recency)
   */
  touch(id: string): void {
    cache.updateAccess(id)
  },

  /**
   * Replace cache (used by Supabase sync in Phase 4)
   */
  setCache(newCache: MemoryCache): void {
    cache = newCache
  },
}

/**
 * Format memories for LLM injection
 */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (!memories.length) return ''

  const grouped = memories.reduce(
    (acc, m) => {
      if (!acc[m.category]) acc[m.category] = []
      acc[m.category].push(m)
      return acc
    },
    {} as Record<MemoryCategory, MemoryEntry[]>,
  )

  const sections = Object.entries(grouped).map(([cat, mems]) => {
    const title = cat.toUpperCase()
    const items = mems.map((m) => `  • ${m.content}`)
    return `${title}:\n${items.join('\n')}`
  })

  return `CONTEXTUAL MEMORIES:\n${sections.join('\n\n')}`
}
