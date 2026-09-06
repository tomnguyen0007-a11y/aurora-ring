/**
 * A one-slot handoff for "ask Jarvis this" from anywhere in the shell.
 *
 * The Jarvis module is code-split, so the shell cannot call its send() without
 * dragging the whole chunk into the main bundle. Instead the palette parks the
 * question here and navigates; Jarvis picks it up on mount and answers it.
 */
let pending: string | null = null

export function setPendingAsk(text: string) {
  pending = text.trim() || null
}

/** Reads and clears — a question is only ever asked once. */
export function takePendingAsk(): string | null {
  const q = pending
  pending = null
  return q
}
