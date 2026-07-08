import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '../../store/store'
import { fullKnowledge } from './knowledge'

function reset() {
  useStore.setState({ knowledgeDocs: [] })
}

describe('Brain Feed → Jarvis context', () => {
  afterEach(reset)

  it('injects a pasted knowledge doc into fullKnowledge()', () => {
    useStore.getState().addKnowledgeDoc('My Hybrid Block', 'Run easy Mon/Wed, long run Sat. Deadlift 5x3 at RPE8.', 'pasted')
    const k = fullKnowledge()
    expect(k).toContain('My Hybrid Block')
    expect(k).toContain('Deadlift 5x3 at RPE8')
    expect(k).toContain("TOM'S OWN KNOWLEDGE")
  })

  it('shows the source (filename) when it is a real upload, not for plain pasted notes', () => {
    useStore.getState().addKnowledgeDoc('Fuelling', 'carbs by day type', 'fuelling.md')
    useStore.getState().addKnowledgeDoc('Scratch', 'quick idea', 'pasted')
    const k = fullKnowledge()
    expect(k).toContain('Fuelling (fuelling.md)')
    expect(k).not.toContain('Scratch (pasted)')
  })

  it('contributes nothing (no header) when the feed is empty', () => {
    const k = fullKnowledge()
    expect(k).not.toContain("TOM'S OWN KNOWLEDGE")
  })

  it('truncates to the character budget so a huge vault cannot blow the context window', () => {
    // One giant doc well over the 14k budget
    const huge = 'x'.repeat(40000)
    useStore.getState().addKnowledgeDoc('Giant', huge, 'pasted')
    const k = fullKnowledge()
    expect(k).toContain('…[truncated]')
    // The injected feed portion must not carry the full 40k
    expect(k.length).toBeLessThan(30000)
  })

  it('newest docs win the budget; fully-displaced older ones are counted as not-shown', () => {
    useStore.getState().addKnowledgeDoc('Older A', 'a'.repeat(2000), 'pasted')
    useStore.getState().addKnowledgeDoc('Older B', 'b'.repeat(2000), 'pasted')
    useStore.getState().addKnowledgeDoc('Newest', 'z'.repeat(15000), 'pasted') // added last → newest, fills the budget alone
    const k = fullKnowledge()
    expect(k).toContain('Newest')
    expect(k).toContain('2 more note(s) not shown')
    expect(k).not.toContain('Older A')
  })
})
