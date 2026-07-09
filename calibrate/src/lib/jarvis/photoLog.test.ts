import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '../../store/store'
import { applyActions } from './actions'

function reset() {
  useStore.setState({ trainingPhotos: [] })
}

describe('log_photo action → dated photo gallery', () => {
  afterEach(reset)

  it('saves a photo with the attached image data, category, and caption', () => {
    const receipts = applyActions([{ type: 'log_photo', category: 'golf', caption: 'putting gate drill', imageData: 'data:image/jpeg;base64,AAAA' }])
    const photos = useStore.getState().trainingPhotos
    expect(photos).toHaveLength(1)
    expect(photos[0].category).toBe('golf')
    expect(photos[0].caption).toBe('putting gate drill')
    expect(photos[0].dataUrl).toBe('data:image/jpeg;base64,AAAA')
    expect(receipts[0]).toContain('Golf gallery')
  })

  it('refuses to log a photo with no attached image instead of silently creating a blank entry', () => {
    const receipts = applyActions([{ type: 'log_photo', category: 'training', caption: 'leg day' }])
    expect(useStore.getState().trainingPhotos).toHaveLength(0)
    expect(receipts[0]).toMatch(/no photo attached/i)
  })

  it('defaults to today when no date is given, and respects an explicit one', () => {
    applyActions([{ type: 'log_photo', category: 'other', imageData: 'data:image/jpeg;base64,BBBB', date: '2026-01-01' }])
    expect(useStore.getState().trainingPhotos[0].date).toBe('2026-01-01')
  })
})
