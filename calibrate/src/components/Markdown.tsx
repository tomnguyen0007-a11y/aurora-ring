import type { ReactNode } from 'react'
import { Fragment } from 'react'

// Minimal markdown renderer for vault notes — headings, lists, checkboxes,
// quotes, code, bold/italic, links, plus Obsidian-style [[wiki-links]] and #tags.
// Builds React elements directly (no HTML injection), zero dependencies.

interface MarkdownProps {
  text: string
  onWikiLink?: (title: string) => void
}

const INLINE_RE =
  /(\[\[([^\]|]+)(?:\|([^\]]+))?\]\])|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|((^|\s)#([a-z0-9][\w/-]*))/gi

function renderInline(text: string, onWikiLink?: (title: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    if (m[1]) {
      const target = m[2].trim()
      out.push(
        <button
          key={key++}
          type="button"
          className="rounded bg-signal/10 px-1 text-signal underline decoration-signal/40 underline-offset-2 hover:bg-signal/20"
          onClick={() => onWikiLink?.(target)}
        >
          {m[3]?.trim() || target}
        </button>,
      )
    } else if (m[4]) out.push(<strong key={key++}>{m[5]}</strong>)
    else if (m[6]) out.push(<em key={key++}>{m[7]}</em>)
    else if (m[8]) out.push(<code key={key++} className="rounded bg-white/[0.07] px-1 py-0.5 font-mono text-[0.85em]">{m[9]}</code>)
    else if (m[10])
      out.push(
        <a key={key++} href={m[12]} target="_blank" rel="noreferrer" className="text-signal underline underline-offset-2">
          {m[11]}
        </a>,
      )
    else if (m[13]) {
      out.push(m[14])
      out.push(<span key={key++} className="text-signal/80">#{m[15]}</span>)
    }
    last = i + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text, onWikiLink }: MarkdownProps) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let key = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-lg border border-edge bg-black/40 p-3 font-mono text-xs leading-relaxed text-ice/90">
          {code.join('\n')}
        </pre>,
      )
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)/)
    if (h) {
      const level = h[1].length
      const cls =
        level === 1
          ? 'font-display text-xl font-bold tracking-wide text-ice'
          : level === 2
            ? 'font-display text-lg font-bold tracking-wide text-ice'
            : 'font-display text-base font-semibold tracking-wide text-ice/90'
      blocks.push(
        <div key={key++} className={`${cls} mt-1`}>
          {renderInline(h[2], onWikiLink)}
        </div>,
      )
      i++
      continue
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="border-edge" />)
      i++
      continue
    }

    if (/^\s*(?:[-*]|\d+\.)\s/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s/.test(lines[i])) {
        const raw = lines[i].replace(/^\s*(?:[-*]|\d+\.)\s/, '')
        const check = raw.match(/^\[([ xX])\]\s*(.*)/)
        items.push(
          <li key={items.length} className="flex items-start gap-2">
            {check ? (
              <>
                <span
                  className={`mt-[3px] inline-block h-3.5 w-3.5 shrink-0 rounded border ${
                    check[1] !== ' ' ? 'border-signal bg-signal/30' : 'border-edge-strong'
                  }`}
                />
                <span className={check[1] !== ' ' ? 'text-fog line-through' : ''}>{renderInline(check[2], onWikiLink)}</span>
              </>
            ) : (
              <>
                <span className="mt-[9px] inline-block h-1 w-1 shrink-0 rounded-full bg-haze" />
                <span>{renderInline(raw, onWikiLink)}</span>
              </>
            )}
          </li>,
        )
        i++
      }
      blocks.push(
        <ul key={key++} className="space-y-1">
          {items}
        </ul>,
      )
      continue
    }

    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-signal/50 pl-3 text-haze italic">
          {quote.map((q, qi) => (
            <Fragment key={qi}>
              {renderInline(q, onWikiLink)}
              {qi < quote.length - 1 && <br />}
            </Fragment>
          ))}
        </blockquote>,
      )
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*(?:[-*]|\d+\.)\s|-{3,}\s*$)/.test(lines[i])) {
      para.push(lines[i++])
    }
    blocks.push(
      <p key={key++}>
        {para.map((p, pi) => (
          <Fragment key={pi}>
            {renderInline(p, onWikiLink)}
            {pi < para.length - 1 && <br />}
          </Fragment>
        ))}
      </p>,
    )
  }

  return <div className="space-y-3 text-[0.95rem] leading-relaxed text-ice/90">{blocks}</div>
}
