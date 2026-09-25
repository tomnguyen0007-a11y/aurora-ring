/* ════════════════════════════════════════════════════════════════════
   BOOK SEARCH
   Open Library's search API — free, keyless, no signup, and (like the
   remote sources in foodSearch.ts) sends permissive CORS headers, so this
   works straight from the browser with no proxy. Turns a typed title into
   a real cover, author, and page count instead of a blank library card.
   Docs: https://openlibrary.org/dev/docs/api/search
   ════════════════════════════════════════════════════════════════════ */

export interface BookMatch {
  title: string
  author: string
  /** Medium-size cover JPEG, or null when Open Library has none on file. */
  coverUrl: string | null
  /** Best-guess page count (median across editions) — 0 when unknown. */
  totalPages: number
  year: number | null
}

interface OpenLibraryDoc {
  title?: string
  author_name?: string[]
  cover_i?: number
  number_of_pages_median?: number
  first_publish_year?: number
}

export async function searchBooks(query: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const q = query.trim()
  if (!q) return []

  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
    `&limit=8&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year`
  const res = await fetch(url, { signal })
  if (!res.ok) return []

  const data = (await res.json()) as { docs?: OpenLibraryDoc[] }
  return (data.docs ?? [])
    .filter((d): d is OpenLibraryDoc & { title: string } => !!d.title)
    .map(
      (d): BookMatch => ({
        title: d.title,
        author: d.author_name?.[0] ?? '',
        coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        totalPages: d.number_of_pages_median ?? 0,
        year: d.first_publish_year ?? null,
      }),
    )
}
