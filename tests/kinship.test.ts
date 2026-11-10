import { describe, expect, it } from 'vitest'
import { kinshipName } from '../src/ui/kinship'

const blood = (up: number, down: number, half = false) =>
  kinshipName({ people: new Set(), steps: { up, down, half }, partners: false })

describe('kinshipName', () => {
  it('names the close family', () => {
    expect(blood(2, 0)).toBe('avô/avó')
    expect(blood(0, 3)).toBe('bisneto(a)')
    expect(blood(1, 1)).toBe('irmão/irmã')
    expect(blood(1, 1, true)).toBe('meio-irmão/meia-irmã')
    expect(blood(2, 1)).toBe('tio(a)')
    expect(blood(1, 2)).toBe('sobrinho(a)')
  })

  it('counts the degree of cousins', () => {
    expect(blood(2, 2)).toBe('primo(a) direito(a)')
    expect(blood(2, 3)).toBe('primo(a) em segundo grau')
    expect(blood(3, 2)).toBe('primo(a) em segundo grau')
    expect(blood(3, 3)).toBe('primo(a) em segundo grau')
    expect(blood(4, 4)).toBe('primo(a) em terceiro grau')
    expect(blood(11, 2)).toBe('primo(a) em 10.º grau')
  })

  it('has no name for relatives by marriage, except partners', () => {
    expect(kinshipName({ people: new Set(), steps: null, partners: false })).toBeNull()
    expect(kinshipName({ people: new Set(), steps: null, partners: true })).toBe('companheiro(a)')
  })
})
