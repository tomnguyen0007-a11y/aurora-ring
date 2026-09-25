import { describe, expect, it } from 'vitest'
import { authorScore, bestCoverMatch, sharpCover, titleScore, type BookMatch } from './bookSearch'

const m = (title: string, author: string, coverUrl: string | null = 'x.jpg'): BookMatch => ({
  title,
  author,
  coverUrl,
  totalPages: 0,
  year: null,
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
