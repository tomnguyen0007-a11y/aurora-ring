/* ════════════════════════════════════════════════════════════════════
   BOOK SUMMARY
   A short, useful summary for every book: what it argues and the ideas
   worth keeping. Two tiers:

   1. An AI brain is configured (Settings → Jarvis) → it writes the summary,
      grounded on the catalogue description when there is one. It is told
      to say UNKNOWN rather than invent a book it doesn't know.
   2. No brain, or it declined → the catalogue description, trimmed to a
      few sentences. Publisher copy, but real.

   `definitive` is false when nothing answered at all (offline, rate-
   limited) — the caller should retry later rather than record "none".
   ════════════════════════════════════════════════════════════════════ */

import { describeBook } from './bookSearch'
import { completeText, llmConfigured } from './jarvis/llm'

const SYSTEM = `You write summaries for a personal reading log. Plain text only, no markdown, no headings.
Format exactly:
One or two sentences on what the book is and its central argument.
Then 3 to 5 lines, each starting with "• ", one key idea per line, concrete and specific, under 18 words each.
Total under 110 words. No praise, no filler, no "this book". If you do not actually know this book and no description is given, reply with the single word UNKNOWN.`

/** First n sentences, never cutting mid-word. */
export function firstSentences(text: string, n = 3, maxChars = 420): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text]
  let out = ''
  for (const p of parts.slice(0, n)) {
    if ((out + p).length > maxChars && out) break
    out += p
  }
  out = out.trim() || text.slice(0, maxChars)
  return out.length > maxChars ? `${out.slice(0, out.lastIndexOf(' ', maxChars))}…` : out
}

/** Strip stray markdown a model adds anyway. */
export function cleanSummary(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface SummaryResult {
  text: string | null
  definitive: boolean
}

export async function summarizeBook(title: string, author: string, signal?: AbortSignal): Promise<SummaryResult> {
  let catalogueAnswered = true
  const blurb = await describeBook(title, author, signal).catch(() => {
    catalogueAnswered = false
    return null
  })
  if (signal?.aborted) return { text: null, definitive: false }

  if (llmConfigured()) {
    const prompt =
      `Book: ${title}${author ? ` by ${author}` : ''}` +
      (blurb ? `\n\nCatalogue description (may be marketing copy):\n${blurb.slice(0, 1500)}` : '')
    try {
      const text = await completeText(SYSTEM, prompt, 350)
      if (!/^\s*UNKNOWN\b/i.test(text)) return { text: cleanSummary(text), definitive: true }
      if (!blurb) return { text: null, definitive: true }
    } catch {
      // Rate-limited or offline — fall through to the catalogue text.
    }
  }

  return { text: blurb ? firstSentences(blurb) : null, definitive: catalogueAnswered }
}
