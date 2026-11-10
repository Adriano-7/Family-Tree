import { describe, expect, it } from 'vitest'
import { sideSlug } from '../src/ui/hooks'

describe('sideSlug', () => {
  it('writes a side of the family as a plain link', () => {
    expect(sideSlug('Machado')).toBe('machado')
    expect(sideSlug('Magalhães')).toBe('magalhaes')
    expect(sideSlug(' Santos  Silva ')).toBe('santos-silva')
  })
})
