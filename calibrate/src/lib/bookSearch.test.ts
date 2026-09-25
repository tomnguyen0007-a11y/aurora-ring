import { describe, expect, it } from 'vitest'
import { authorScore, bestCoverMatch, coverCandidates, fromGoogle, mergeResults, plainText, sharpCover, titleScore, type BookMatch } from './bookSearch'
import { cleanSummary, firstSentences } from './bookSummary'

const m = (title: string, author: string, coverUrl: string | null = 'x.jpg'): BookMatch => ({
  title,
  author,
  coverUrl,
  totalPages: 0,
  year: null,
  source: 'openlibrary',
})

describe('titleScore', () => {
  it('ignores subtitles, case and accents', () => {
    expect(titleScore('The Almanack of Naval Ravikant', 'The Almanack of Naval Ravikant: A Guide to Wealth')).toBe(1)
    expect(titleScore('Psychologie peněz', 'PSYCHOLOGIE PENEZ')).toBe(1)
  })
  it('rejects a longer, different title', () => {
    expect(titleScore('Dune', 'Dune Messiah')).toBeLessThan(0.75)
  })
})

describe('authorScore', () => {
  it('matches on surname despite initials', () => {
    expect(authorScore('Professor R. Larry', 'Larry')).toBe(1)
    expect(authorScore('Alex Banyan', 'Alex Banayan')).toBe(1)
  })
  it('rejects a different author', () => {
    expect(authorScore('Morgan Housel', 'Robert Kiyosaki')).toBe(0)
  })
})

describe('bestCoverMatch', () => {
  it('skips wrong books and coverless hits', () => {
    const hits = [m('The Third Door', 'Alex Banayan', null), m('The Fourth Turning', 'William Strauss'), m('The Third Door', 'Alex Banayan', 'right.jpg')]
    expect(bestCoverMatch('The Third Door', 'Alex Banayan', hits)?.coverUrl).toBe('right.jpg')
  })
  it('returns null rather than a guess', () => {
    expect(bestCoverMatch('Bruselský diktát', 'Houska', [m('Brussels', 'Someone')])).toBeNull()
  })
})

describe('sharpCover', () => {
  it('upgrades medium Open Library covers to large', () => {
    expect(sharpCover('https://covers.openlibrary.org/b/id/123-M.jpg')).toBe('https://covers.openlibrary.org/b/id/123-L.jpg')
    expect(sharpCover('https://example.com/a-M.jpg')).toBe('https://example.com/a-M.jpg')
  })
})

describe('Google Books', () => {
  it('maps a volume, preferring the sharp cover render', () => {
    const m = fromGoogle({
      id: 'abc',
      volumeInfo: {
        title: 'Meditations',
        authors: ['Marcus Aurelius'],
        publisher: 'Penguin Classics',
        publishedDate: '2006-04-25',
        pageCount: 304,
        description: '<p>Written in Greek by the only Roman emperor who was also a philosopher.</p>',
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&zoom=1' },
      },
    })
    expect(m).toMatchObject({ title: 'Meditations', publisher: 'Penguin Classics', year: 2006, totalPages: 304, source: 'google' })
    expect(m?.coverUrl).toContain('fife=w800')
    expect(m?.description).toBe('Written in Greek by the only Roman emperor who was also a philosopher.')
  })
  it('has no cover when Google has no image', () => {
    expect(fromGoogle({ id: 'x', volumeInfo: { title: 'T' } })?.coverUrl).toBeNull()
  })
  it('falls back from the sharp render to the thumbnail', () => {
    const [hi, lo] = coverCandidates('https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&fife=w800')
    expect(hi).toContain('fife=w800')
    expect(lo).not.toContain('fife')
  })
  it('strips HTML entities', () => {
    expect(plainText('A &amp; B<br/>C')).toBe('A & B C')
  })
})

describe('mergeResults', () => {
  it('keeps every Google edition but drops Open Library duplicates of the same work', () => {
    const g = [{ ...m('Meditations', 'Marcus Aurelius', 'g1'), source: 'google' as const }, { ...m('Meditations', 'Marcus Aurelius', 'g2'), source: 'google' as const }]
    const o = [m('Meditations', 'Marcus Aurelius', 'o1'), m('Letters from a Stoic', 'Seneca', 'o2')]
    expect(mergeResults(g, o).map((x) => x.coverUrl)).toEqual(['g1', 'g2', 'o2'])
  })
})

describe('summary text', () => {
  it('trims a blurb to whole sentences', () => {
    expect(firstSentences('One. Two! Three? Four.', 2)).toBe('One. Two!')
  })
  it('strips markdown a model adds anyway', () => {
    expect(cleanSummary('## Title\n**Bold** idea\n- point')).toBe('Title\nBold idea\n• point')
  })
})
