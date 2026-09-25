import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/icons";
import {
  Bar,
  Chain,
  DangerBtn,
  Empty,
  Eyebrow,
  IconBtn,
  InlineArea,
  InlineText,
  NumCell,
  Page,
  Section,
  Sheet,
  Tools,
} from "../components/ui";
import { searchBooks, type BookMatch } from "../lib/bookSearch";
import { todayISO } from "../lib/dates";
import { habitChain, habitStreak } from "../lib/habits";
import { useStore } from "../store/store";
import type { Book, BookStatus } from "../store/types";

/* ════════════════════════════════════════════════════════════════════
   READING
   Same anatomy as a proper reading tracker — the year's count and goal,
   a month-by-month strip, lifetime stats, what's on the nightstand, and
   a cover wall of everything read — drawn in Calibrate's own system:
   hairlines and whitespace, no floating cards.
   ════════════════════════════════════════════════════════════════════ */

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// ── Covers ─────────────────────────────────────────────────────────

type CoverSize = "sm" | "lg" | "fill";

/** Cover art, or a typeset title tile when there is none (or it fails to load). */
function Cover({
  book,
  size,
}: {
  book: Pick<Book, "title" | "author" | "coverUrl">;
  size: CoverSize;
}) {
  const [broken, setBroken] = useState(false);
  const box =
    size === "sm"
      ? "h-12 w-8"
      : size === "lg"
        ? "h-40 w-[6.75rem]"
        : "aspect-[2/3] w-full";
  if (book.coverUrl && !broken) {
    return (
      <img
        src={book.coverUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${box} shrink-0 border border-line object-cover`}
      />
    );
  }
  if (size === "sm") {
    return (
      <span
        className={`${box} flex shrink-0 items-center justify-center border border-line bg-ink-2 text-faint`}
      >
        <Icon name="books" size={13} />
      </span>
    );
  }
  return (
    <span
      className={`${box} flex shrink-0 flex-col justify-between overflow-hidden border border-line bg-ink-2 p-3 text-left`}
    >
      <span
        className={`line-clamp-5 font-medium leading-tight text-paper ${size === "lg" ? "text-micro" : "text-body"}`}
      >
        {book.title}
      </span>
      {book.author && (
        <span className="truncate text-[9px] uppercase tracking-[0.08em] text-faint">
          {book.author}
        </span>
      )}
    </span>
  );
}

// Backfill covers for books added before search existed (or typed by hand).
// One attempt per book per session; Open Library is free but not a firehose.
const coverTried = new Set<string>();

async function findCover(
  b: Book,
  signal: AbortSignal,
): Promise<BookMatch | null> {
  const queries = [`${b.title} ${b.author}`.trim(), b.title];
  for (const q of queries) {
    const hits = await searchBooks(q, signal).catch(() => [] as BookMatch[]);
    const hit = hits.find((h) => h.coverUrl);
    if (hit) return hit;
  }
  return null;
}

function useCoverBackfill(books: Book[]) {
  const missing = books
    .filter((b) => !b.coverUrl && !coverTried.has(b.id))
    .map((b) => b.id)
    .join(",");
  useEffect(() => {
    if (!missing) return;
    const controller = new AbortController();
    void (async () => {
      for (const b of useStore
        .getState()
        .books.filter((x) => !x.coverUrl && !coverTried.has(x.id))) {
        coverTried.add(b.id);
        const hit = await findCover(b, controller.signal);
        if (controller.signal.aborted) {
          coverTried.delete(b.id); // interrupted, not a genuine miss — retry next mount
          return;
        }
        if (hit?.coverUrl) {
          useStore
            .getState()
            .updateBook(b.id, {
              coverUrl: hit.coverUrl,
              ...(b.totalPages ? {} : { totalPages: hit.totalPages }),
            });
        }
      }
    })();
    return () => controller.abort();
  }, [missing]);
}

// ── Pieces ─────────────────────────────────────────────────────────

function Stars({ book, size = 13 }: { book: Book; size?: number }) {
  const s = useStore();
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() =>
            s.updateBook(book.id, { rating: v === book.rating ? null : v })
          }
          aria-label={`Rate ${v}`}
        >
          <Icon
            name="star"
            size={size}
            className={v <= (book.rating ?? 0) ? "text-paper" : "text-ghost"}
          />
        </button>
      ))}
    </div>
  );
}

function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function ReadingNow({ book }: { book: Book }) {
  const s = useStore();
  const pct = book.totalPages
    ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
    : 0;
  const since = monthYear(book.startedAt);
  return (
    <li className="group flex gap-6 border-b border-line py-6 first:pt-0 last:border-b-0">
      <Cover book={book} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <InlineText
              value={book.title}
              onChange={(v) => s.updateBook(book.id, { title: v })}
              ariaLabel="Book title"
              className="t-page"
            />
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-body text-mute">
              <InlineText
                value={book.author}
                onChange={(v) => s.updateBook(book.id, { author: v })}
                ariaLabel="Author"
                placeholder="Author"
                className="text-body text-mute"
              />
              {since && (
                <span className="shrink-0 text-faint">· since {since}</span>
              )}
            </div>
          </div>
          <Tools>
            <DangerBtn
              onConfirm={() => s.removeBook(book.id)}
              label={`Delete ${book.title}`}
            />
          </Tools>
        </div>

        <Bar pct={pct} className="mt-6" />
        <div className="mt-3 flex items-baseline gap-1 text-body text-faint">
          <span>p.</span>
          <NumCell
            value={book.currentPage || null}
            onChange={(v) => s.updateBook(book.id, { currentPage: v ?? 0 })}
            ariaLabel="Current page"
            width="w-12"
          />
          <span>of</span>
          <NumCell
            value={book.totalPages || null}
            onChange={(v) => s.updateBook(book.id, { totalPages: v ?? 0 })}
            ariaLabel="Total pages"
            width="w-12"
          />
          <span className="num">· {pct}%</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn btn-solid"
            onClick={() =>
              s.updateBook(book.id, {
                status: "finished",
                currentPage: book.totalPages || book.currentPage,
              })
            }
          >
            Finished <Icon name="check" size={13} />
          </button>
          <button
            className="btn"
            onClick={() => s.updateBook(book.id, { status: "queued" })}
          >
            Back to queue
          </button>
        </div>
      </div>
    </li>
  );
}

/** Everything about one book, editable in one place — opened from the cover wall. */
function BookSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const s = useStore();
  const book = s.books.find((b) => b.id === id);
  if (!book) return null;
  const moves: { id: BookStatus; label: string }[] = [
    { id: "reading", label: "Reading" },
    { id: "queued", label: "Want to read" },
    { id: "finished", label: "Finished" },
  ];
  return (
    <Sheet
      open
      onClose={onClose}
      title={
        book.status === "finished"
          ? "Read"
          : book.status === "queued"
            ? "Want to read"
            : "Reading"
      }
      wide
    >
      <div className="flex gap-5">
        <Cover book={book} size="lg" />
        <div className="min-w-0 flex-1">
          <InlineText
            value={book.title}
            onChange={(v) => s.updateBook(book.id, { title: v })}
            ariaLabel="Book title"
            className="t-head"
          />
          <InlineText
            value={book.author}
            onChange={(v) => s.updateBook(book.id, { author: v })}
            ariaLabel="Author"
            placeholder="Author"
            className="mt-1 text-body text-mute"
          />
          <div className="mt-4 flex items-baseline gap-1 text-micro text-faint">
            <NumCell
              value={book.totalPages || null}
              onChange={(v) => s.updateBook(book.id, { totalPages: v ?? 0 })}
              ariaLabel="Total pages"
              width="w-12"
            />
            <span>pages</span>
            {book.status === "finished" && (
              <>
                <span className="mx-1.5">·</span>
                <span>finished</span>
                <input
                  type="date"
                  className="field-line num text-micro text-mute"
                  value={book.finishedAt ?? ""}
                  aria-label="Finished on"
                  onChange={(e) =>
                    s.updateBook(book.id, {
                      finishedAt: e.target.value || null,
                    })
                  }
                />
              </>
            )}
          </div>
          {book.status === "finished" && (
            <div className="mt-4">
              <Stars book={book} size={15} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <InlineArea
          value={book.notes}
          onChange={(v) => s.updateBook(book.id, { notes: v })}
          ariaLabel="Notes"
          placeholder="What stuck. Quotes, ideas, what to do about it…"
          className="!text-micro"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {moves
          .filter((m) => m.id !== book.status)
          .map((m) => (
            <button
              key={m.id}
              className="btn btn-sm"
              onClick={() => s.updateBook(book.id, { status: m.id })}
            >
              → {m.label}
            </button>
          ))}
        <span className="ml-auto">
          <DangerBtn
            onConfirm={() => {
              s.removeBook(book.id);
              onClose();
            }}
            label={`Delete ${book.title}`}
          />
        </span>
      </div>
    </Sheet>
  );
}

/** Search Open Library; add straight to Reading or Want to read. Manual entry behind a toggle. */
function AddBooks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    try {
      setResults(await searchBooks(query, controller.signal));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const add = (m: BookMatch, status: BookStatus) => {
    s.addBook({
      title: m.title,
      author: m.author,
      totalPages: m.totalPages,
      coverUrl: m.coverUrl,
      status,
    });
    setAdded((a) => [...a, `${m.title}|${m.author}`]);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add books" wide>
      <form className="flex gap-2" onSubmit={run}>
        <input
          className="field min-w-0 flex-1"
          placeholder="Title, author or ISBN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button
          className="btn btn-solid shrink-0"
          type="submit"
          disabled={searching}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {results && results.length > 0 && (
        <ul className="mt-4">
          {results.map((m, i) => {
            const done = added.includes(`${m.title}|${m.author}`);
            return (
              <li
                key={i}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
              >
                <Cover
                  book={{
                    title: m.title,
                    author: m.author,
                    coverUrl: m.coverUrl,
                  }}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-paper">
                    {m.title}
                  </span>
                  <span className="block truncate text-micro text-faint">
                    {m.author || "Unknown author"}
                    {m.year ? ` · ${m.year}` : ""}
                    {m.totalPages ? ` · ${m.totalPages} pp` : ""}
                  </span>
                </span>
                {done ? (
                  <span className="shrink-0 text-micro text-faint">Added</span>
                ) : (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      className="btn btn-sm"
                      onClick={() => add(m, "reading")}
                    >
                      Reading
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => add(m, "queued")}
                    >
                      Want
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => add(m, "finished")}
                    >
                      Read
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {results && results.length === 0 && (
        <Empty>No match on Open Library. Add it by hand below.</Empty>
      )}

      <button
        type="button"
        className="mt-5 block text-micro text-faint hover:text-paper"
        onClick={() => setManual((v) => !v)}
      >
        {manual ? "Hide manual entry" : "Can't find it? Add manually"}
      </button>
      {manual && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            s.addBook({
              title: title.trim(),
              author: author.trim(),
              status: "queued",
            });
            setTitle("");
            setAuthor("");
          }}
        >
          <input
            className="field min-w-0 flex-1"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="field min-w-0 flex-1"
            placeholder="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <button className="btn btn-solid" type="submit">
            Add
          </button>
        </form>
      )}
    </Sheet>
  );
}

// ── Page ───────────────────────────────────────────────────────────

type Tab = "read" | "want";
type Sort = "recent" | "title" | "rating";

export function Books({ label }: { label: string }) {
  const s = useStore();
  useCoverBackfill(s.books);

  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("read");
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState("");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayMin = s.readingLog[todayISO()] ?? 0;
  const habit = s.habits.find((h) => h.id === "h-read");

  const finished = s.books.filter((b) => b.status === "finished");
  const reading = s.books.filter((b) => b.status === "reading");
  const queued = s.books.filter((b) => b.status === "queued");
  const thisYear = finished.filter((b) =>
    b.finishedAt?.startsWith(String(year)),
  );
  const perMonth = MONTHS.map(
    (_, m) =>
      thisYear.filter((b) => Number(b.finishedAt!.slice(5, 7)) === m + 1)
        .length,
  );
  const peak = Math.max(2, ...perMonth);
  const pages = finished.reduce((sum, b) => sum + (b.totalPages || 0), 0);
  const rated = finished.filter((b) => b.rating);
  const avg = rated.length
    ? (
        rated.reduce((sum, b) => sum + (b.rating ?? 0), 0) / rated.length
      ).toFixed(1)
    : "—";
  const monthsLeft = 11 - month;

  const shelf = useMemo(() => {
    const pool = tab === "read" ? finished : queued;
    const q = filter.trim().toLowerCase();
    const hits = q
      ? pool.filter((b) =>
          `${b.title} ${b.author} ${b.notes}`.toLowerCase().includes(q),
        )
      : pool;
    const sorted = [...hits].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      return (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "");
    });
    // Group by year only where it means something: the read shelf, newest first
    if (tab !== "read" || sort !== "recent")
      return [{ key: "all", label: null as string | null, books: sorted }];
    const groups = new Map<string, Book[]>();
    for (const b of sorted) {
      const k = b.finishedAt?.slice(0, 4) ?? "Undated";
      groups.set(k, [...(groups.get(k) ?? []), b]);
    }
    return [...groups.entries()].map(([k, books]) => ({
      key: k,
      label: k,
      books,
    }));
  }, [tab, finished, queued, filter, sort]);

  return (
    <Page
      title={label}
      actions={
        <button className="btn btn-solid" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add books
        </button>
      }
    >
      {/* Year readout left, the month strip right — the page's one focal number.
          Header + stats are one block: Page spaces its children generously. */}
      <div>
        <header className="flex flex-col gap-10 border-b border-line pb-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="readout glow text-[5rem] leading-[0.9] sm:text-[6rem]">
              {thisYear.length}
            </div>
            <p className="mt-4 text-body text-mute">books finished in {year}</p>
            <div className="mt-4 inline-flex items-baseline gap-1.5 border border-line px-3 py-1.5 text-micro text-mute">
              <span>Read goal</span>
              <span className="num text-paper">{thisYear.length}/</span>
              <NumCell
                value={s.bookGoal}
                onChange={(v) => s.setBookGoal(v ?? s.bookGoal)}
                ariaLabel="Yearly reading goal"
                width="w-6"
              />
              <span className="text-faint">
                · {monthsLeft ? `${monthsLeft} mo left` : "final month"}
              </span>
            </div>
          </div>

          <div
            className="grid w-full max-w-md grid-cols-12 gap-1.5 lg:w-[26rem]"
            aria-label={`Books finished per month, ${year}`}
          >
            {MONTHS.map((m, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <span
                  className={`num h-4 text-micro ${perMonth[i] ? "text-mute" : "text-transparent"}`}
                >
                  {perMonth[i] || 0}
                </span>
                <div
                  className="relative h-20 w-full bg-white/[0.06]"
                  title={`${perMonth[i]} in ${new Date(year, i).toLocaleDateString("en-GB", { month: "long" })}`}
                >
                  <div
                    className={`absolute inset-x-0 bottom-0 transition-[height] duration-500 ${i === month ? "bg-paper" : "bg-paper/70"}`}
                    style={{ height: `${(perMonth[i] / peak) * 100}%` }}
                  />
                </div>
                <span
                  className={`text-micro ${i === month ? "font-medium text-paper" : i > month ? "text-ghost" : "text-faint"}`}
                >
                  {m}
                </span>
              </div>
            ))}
          </div>
        </header>

        <div className="flex divide-x divide-line py-6">
          {[
            { label: "All time", value: finished.length },
            { label: "Pages", value: pages.toLocaleString("en-US") },
            { label: "Avg rating", value: avg === "—" ? avg : `${avg}★` },
          ].map((st) => (
            <div key={st.label} className="pr-8 [&:not(:first-child)]:pl-8">
              <Eyebrow>{st.label}</Eyebrow>
              <div className="readout mt-2 text-[1.5rem]">{st.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
        <Section label={`Reading now · ${reading.length}`}>
          {reading.length ? (
            <ul>
              {reading.map((b) => (
                <ReadingNow key={b.id} book={b} />
              ))}
            </ul>
          ) : (
            <Empty>
              Nothing on the nightstand. Pull one from Want to read.
            </Empty>
          )}
        </Section>

        {/* The fifteen-minute habit rides alongside, not on top. */}
        <Section label="Today">
          <div className="flex items-baseline gap-1">
            <span className="readout text-[2.25rem]">{todayMin}</span>
            <span className="text-body text-faint">/15 min</span>
          </div>
          {habit && (
            <div className="eyebrow mt-2">
              {habitStreak(s, habit)} day streak
            </div>
          )}
          <Bar pct={Math.min(100, (todayMin / 15) * 100)} className="mt-4" />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {todayMin > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => s.logReading(todayISO(), -15)}
                aria-label="Subtract 15 minutes"
              >
                −15
              </button>
            )}
            {[15, 30, 45].map((m) => (
              <button
                key={m}
                className="btn btn-sm"
                onClick={() => s.logReading(todayISO(), m)}
              >
                +{m}
              </button>
            ))}
          </div>
          {habit && (
            <div className="mt-5">
              <div className="eyebrow mb-2">Last 30 days</div>
              <Chain days={habitChain(s, habit, 30)} size={6} />
            </div>
          )}
        </Section>
      </div>

      <section>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-3">
          <div className="flex gap-5" role="tablist">
            {(
              [
                { id: "read", label: "Read", n: finished.length },
                { id: "want", label: "Want to read", n: queued.length },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative pb-3 -mb-3 text-body transition-colors ${tab === t.id ? "text-paper" : "text-faint hover:text-mute"}`}
              >
                {t.label}{" "}
                <span className="num ml-1 text-micro text-faint">{t.n}</span>
                {tab === t.id && (
                  <span className="absolute inset-x-0 -bottom-px h-px bg-paper" />
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              className="field !py-1 text-micro"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
            >
              <option value="recent">Recent</option>
              <option value="title">Title</option>
              <option value="rating">Rating</option>
            </select>
            <IconBtn
              glyph="grid"
              label="Cover wall"
              active={view === "grid"}
              onClick={() => setView("grid")}
              size={15}
            />
            <IconBtn
              glyph="list"
              label="List"
              active={view === "list"}
              onClick={() => setView("list")}
              size={15}
            />
          </div>
        </div>

        <input
          className="field-line mt-4 w-full py-2 text-body"
          placeholder="Filter by title, author or note"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter books"
        />

        {shelf.every((g) => !g.books.length) ? (
          <Empty>
            {filter
              ? "Nothing matches."
              : tab === "read"
                ? "Nothing finished yet — the wall fills itself."
                : "Queue is empty. Add books to line up what’s next."}
          </Empty>
        ) : (
          shelf.map((g) => (
            <div key={g.key} className="mt-8">
              {g.label && (
                <div className="mb-4 flex items-baseline justify-between border-b border-line pb-2">
                  <span className="num text-body text-paper">{g.label}</span>
                  <span className="eyebrow">
                    {g.books.length} {g.books.length === 1 ? "book" : "books"}
                  </span>
                </div>
              )}
              {view === "grid" ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
                  {g.books.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setDetail(b.id)}
                      className="group text-left"
                      aria-label={`Open ${b.title}`}
                    >
                      <div className="transition-opacity group-hover:opacity-80">
                        <Cover book={b} size="fill" />
                      </div>
                      {b.rating ? (
                        <div
                          className="mt-2 flex gap-0.5 text-paper"
                          aria-label={`${b.rating} stars`}
                        >
                          {Array.from({ length: b.rating }, (_, i) => (
                            <Icon key={i} name="star" size={10} />
                          ))}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <ul>
                  {g.books.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-4 border-b border-line py-3 last:border-b-0"
                    >
                      <button
                        onClick={() => setDetail(b.id)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        <Cover book={b} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-paper">
                            {b.title}
                          </span>
                          <span className="block truncate text-micro text-faint">
                            {b.author || "Unknown author"}
                            {b.totalPages ? ` · ${b.totalPages} pp` : ""}
                          </span>
                        </span>
                      </button>
                      {tab === "read" ? (
                        <Stars book={b} />
                      ) : (
                        <button
                          className="btn btn-sm shrink-0"
                          onClick={() =>
                            s.updateBook(b.id, { status: "reading" })
                          }
                        >
                          Start
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>

      <AddBooks open={adding} onClose={() => setAdding(false)} />
      <BookSheet id={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}
