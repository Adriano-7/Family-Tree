import { describe, expect, it } from 'vitest'
import { addressPath, readAddress, sideSlug } from '../src/ui/hooks'

describe('sideSlug', () => {
  it('writes a side of the family as a plain link', () => {
    expect(sideSlug('Machado')).toBe('machado')
    expect(sideSlug('Magalhães')).toBe('magalhaes')
    expect(sideSlug(' Santos  Silva ')).toBe('santos-silva')
  })
})

describe('shareable addresses', () => {
  it('reads a side, a direct line and a relationship', () => {
    expect(readAddress('/')).toBeNull()
    expect(readAddress('/Machado/')).toEqual({ kind: 'side', slug: 'machado' })
    expect(readAddress('/linhagem/rosa-machado')).toEqual({ kind: 'line', id: 'rosa-machado' })
    expect(readAddress('/familia/rosa-machado')).toEqual({ kind: 'family', id: 'rosa-machado' })
    expect(readAddress('/parentesco/rosa-machado/adriano-alexandre-machado/')).toEqual({
      kind: 'relation',
      from: 'rosa-machado',
      to: 'adriano-alexandre-machado',
    })
  })

  it('ignores an unfinished line or relationship', () => {
    expect(readAddress('/linhagem')).toBeNull()
    expect(readAddress('/parentesco/rosa-machado')).toBeNull()
  })

  it('writes back what it reads', () => {
    for (const path of ['/', '/machado', '/linhagem/rosa-machado', '/familia/rosa-machado', '/parentesco/rosa-machado/adriano-alexandre-machado'])
      expect(addressPath(readAddress(path))).toBe(path)
  })
})
