import { describe, expect, it } from 'vitest'
import { buildGraph, closeFamily, siblings } from '../src/data/graph'
import { computeLayout, LAYER_GAP } from '../src/scene/layout'

const person = (id: string, parents: string[] = [], spouses: string[] = [], born: string | null = null) => ({
  id,
  name: id,
  born,
  parents,
  spouses,
})

const family = () => [
  person('grandpa', [], ['grandma']),
  person('grandma'),
  person('mum', ['grandpa', 'grandma'], [], '1950'),
  person('uncle', ['grandpa', 'grandma'], [], '1947'),
  person('dad', [], ['mum']),
  person('me', ['mum', 'dad']),
]

describe('buildGraph', () => {
  it('derives children, oldest first', () => {
    const g = buildGraph(family())
    expect(g.children.get('grandpa')).toEqual(['uncle', 'mum'])
    expect(g.children.get('me')).toEqual([])
  })

  it('makes partners symmetric', () => {
    const g = buildGraph(family())
    expect(g.spouses.get('grandma')).toEqual(['grandpa'])
    expect(g.spouses.get('mum')).toEqual(['dad'])
  })

  it('puts someone who married in on their partner’s layer', () => {
    const g = buildGraph(family())
    expect(Object.fromEntries(g.generation)).toEqual({ grandpa: 0, grandma: 0, mum: 1, uncle: 1, dad: 1, me: 2 })
    expect(g.generationCount).toBe(3)
  })

  it('rejects a person who is their own ancestor', () => {
    expect(() => buildGraph([person('a', ['b']), person('b', ['a'])])).toThrow(/own ancestor/)
  })

  it('ignores links to people who do not exist', () => {
    const g = buildGraph([person('a', ['ghost'], ['nobody'])])
    expect(g.generation.get('a')).toBe(0)
    expect(g.spouses.get('a')).toEqual([])
  })

  it('finds close family and siblings', () => {
    const g = buildGraph(family())
    expect([...closeFamily(g, 'mum')].sort()).toEqual(['dad', 'grandma', 'grandpa', 'me', 'mum'])
    expect(siblings(g, 'mum')).toEqual(['uncle'])
  })
})

describe('computeLayout', () => {
  it('is the same on every run', () => {
    const a = computeLayout(buildGraph(family()))
    const b = computeLayout(buildGraph(family().reverse()))
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('stacks generations from top to bottom and keeps people apart', () => {
    const g = buildGraph(family())
    const pos = computeLayout(g)
    expect(pos.get('grandpa')![1]).toBeGreaterThan(pos.get('mum')![1] + LAYER_GAP / 2)
    expect(pos.get('mum')![1]).toBeGreaterThan(pos.get('me')![1] + LAYER_GAP / 2)
    const all = [...pos.values()]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1], all[i][2] - all[j][2])).toBeGreaterThan(1.5)
  })
})
