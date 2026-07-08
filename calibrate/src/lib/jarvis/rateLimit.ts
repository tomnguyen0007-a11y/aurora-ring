import type { LlmProvider } from '../../store/types'

const WINDOW_MS = 60_000

// Conservative free-tier ceilings — Anthropic is paid/generous so gets a high
// nominal cap (this limiter exists to protect the free brains, not Claude).
const PROVIDER_LIMIT: Record<LlmProvider, number> = {
  none: 0,
  anthropic: 50,
  gemini: 15,
  groq: 30,
  openrouter: 20,
}

const callLog = new Map<LlmProvider, number[]>()

function prune(provider: LlmProvider): number[] {
  const now = Date.now()
  const log = (callLog.get(provider) ?? []).filter((t) => now - t < WINDOW_MS)
  callLog.set(provider, log)
  return log
}

export function providerLimit(provider: LlmProvider): number {
  return PROVIDER_LIMIT[provider] ?? 15
}

export function canCall(provider: LlmProvider): boolean {
  return prune(provider).length < providerLimit(provider)
}

export function recordCall(provider: LlmProvider): void {
  const log = prune(provider)
  log.push(Date.now())
  callLog.set(provider, log)
}

/** Milliseconds until the oldest call in the window ages out, freeing a slot. */
export function msUntilSlot(provider: LlmProvider): number {
  const log = prune(provider)
  if (log.length < providerLimit(provider)) return 0
  return Math.max(0, WINDOW_MS - (Date.now() - log[0]))
}

export function rateLimitStatus(provider: LlmProvider): { limited: boolean; retryInSec: number } {
  const limited = !canCall(provider)
  return { limited, retryInSec: limited ? Math.ceil(msUntilSlot(provider) / 1000) : 0 }
}

/** Test-only / dev-tool reset — clears all tracked call history. */
export function resetRateLimits(): void {
  callLog.clear()
}
