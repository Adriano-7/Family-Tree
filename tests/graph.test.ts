import { describe, expect, it } from 'vitest'
import { buildGraph, closeFamily, familySides, household, lineage, oldestGenerations, relation, relatives, siblings, visiblePeople } from '../src/data/graph'
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

describe('lineage', () => {
  it('follows ancestors and descendants but not aunts and uncles', () => {
    const g = buildGraph(family())
    const { line, shown } = lineage(g, 'mum')
    expect([...line].sort()).toEqual(['grandma', 'grandpa', 'me', 'mum'])
    expect([...shown].sort()).toEqual(['dad', 'grandma', 'grandpa', 'me', 'mum'])
  })
})

describe('computeLayout', () => {
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

  it('is the same on every run', () => {
    const a = computeLayout(buildGraph(family()))
    const b = computeLayout(buildGraph(family().reverse()))
    expect([...a.positions].sort()).toEqual([...b.positions].sort())
  })

  it('stacks generations from top to bottom and keeps people apart', () => {
    const { positions: pos } = computeLayout(buildGraph(family()))
    expect(pos.get('grandpa')![1]).toBe(pos.get('mum')![1] + LAYER_GAP)
    expect(pos.get('mum')![1]).toBe(pos.get('me')![1] + LAYER_GAP)
    const all = [...pos.values()]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(dist(all[i], all[j])).toBeGreaterThan(2.5)
  })

  it('puts partners side by side and siblings in one row under their parents', () => {
    const { positions: pos } = computeLayout(buildGraph(family()))
    expect(dist(pos.get('grandpa')!, pos.get('grandma')!)).toBeLessThan(4)
    expect(dist(pos.get('mum')!, pos.get('dad')!)).toBeLessThan(4)
    const x = (id: string) => pos.get(id)![0]
    // uncle is older, so he comes first; dad stays next to mum
    expect(x('uncle')).toBeLessThan(x('mum'))
    expect(Math.abs(x('dad') - x('mum'))).toBeLessThan(Math.abs(x('dad') - x('uncle')))
  })

  it('draws one stem per family and marks which children each line leads to', () => {
    const { segments } = computeLayout(buildGraph(family()))
    const descent = segments.filter((s) => s.kind === 'descent')
    const stems = descent.filter((s) => s.children.length === 2)
    expect(stems.length).toBeGreaterThan(0)
    expect(stems.every((s) => s.parents.join() === 'grandma,grandpa')).toBe(true)
    expect(descent.some((s) => s.children.join() === 'me' && s.parents.join() === 'dad,mum')).toBe(true)
    expect([...new Set(segments.filter((s) => s.kind === 'partner').map((s) => s.parents.join()))].sort()).toEqual([
      'dad,mum',
      'grandma,grandpa',
    ])
  })

  it('keeps the children of each partner in their own group, either side of the shared parent', () => {
    const people = [
      person('ana', [], ['joao']),
      person('joao'),
      person('eva', [], ['joao']),
      person('a1', ['ana', 'joao'], [], '1960'),
      person('e1', ['eva', 'joao'], [], '1961'),
      person('a2', ['ana', 'joao'], [], '1962'),
      person('e2', ['eva', 'joao'], [], '1963'),
    ]
    const { positions, segments } = computeLayout(buildGraph(people))
    const x = (id: string) => positions.get(id)![0]
    const order = ['a1', 'a2', 'e1', 'e2'].sort((p, q) => x(p) - x(q)).join()
    expect(['a1,a2,e1,e2', 'e1,e2,a1,a2']).toContain(order)
    // joao is between his partners and above the gap between the two groups
    expect((x('ana') - x('joao')) * (x('eva') - x('joao'))).toBeLessThan(0)
    expect((x('a1') - x('joao')) * (x('e1') - x('joao'))).toBeLessThan(0)
    expect((x('ana') - x('joao')) * (x('a1') - x('joao'))).toBeGreaterThan(0)
    // the two families' lines never share a stretch of the row
    const span = (parent: string) => {
      const xs = segments.filter((s) => s.kind === 'descent' && s.parents.includes(parent)).flatMap((s) => [s.a[0], s.b[0]])
      return [Math.min(...xs), Math.max(...xs)]
    }
    const [anaSpan, evaSpan] = [span('ana'), span('eva')]
    expect(anaSpan[1] < evaSpan[0] || evaSpan[1] < anaSpan[0]).toBe(true)
  })

  it('copes with two family trees joined by a marriage', () => {
    const people = [
      ...family().filter((p) => p.id !== 'dad'),
      person('nan', [], ['pop']),
      person('pop'),
      person('dad', ['nan', 'pop'], ['mum']),
      person('aunt', ['nan', 'pop']),
    ]
    const { positions, segments } = computeLayout(buildGraph(people))
    expect(positions.size).toBe(9)
    // dad stands between mum and his own family, and hangs from his parents' row line like his sister
    const x = (id: string) => positions.get(id)![0]
    expect(Math.abs(x('dad') - x('aunt'))).toBeLessThan(Math.abs(x('mum') - x('aunt')))
    const toDad = segments.filter((s) => s.children.includes('dad') && s.parents.includes('nan'))
    expect(toDad.length).toBeGreaterThan(0)
    expect(toDad.some((s) => s.far)).toBe(false)
  })
})

describe('family sides and filters', () => {
  // Two sides that meet in mum and dad; "in-law" married the uncle.
  const people = () => [
    { ...person('grandpa', [], ['grandma']), families: ['Santos'] },
    { ...person('grandma'), families: ['Silva'] },
    person('mum', ['grandpa', 'grandma']),
    person('uncle', ['grandpa', 'grandma'], ['in-law']),
    person('in-law'),
    { ...person('nonno'), families: ['Machado', 'machado '] },
    person('dad', ['nonno'], ['mum']),
    person('aunt', ['nonno']),
    person('me', ['mum', 'dad']),
    person('brother', ['mum', 'dad']),
    person('kid', ['me']),
  ]
  const side = (name: string) => familySides(buildGraph(people())).find((s) => s.name === name)!

  it('passes a side down to every descendant', () => {
    expect([...side('Santos').line].sort()).toEqual(['brother', 'grandpa', 'kid', 'me', 'mum', 'uncle'])
    expect([...side('Machado').line].sort()).toEqual(['aunt', 'brother', 'dad', 'kid', 'me', 'nonno'])
  })

  it('shows partners beside the side without making them part of it', () => {
    expect(side('Santos').line.has('in-law')).toBe(false)
    expect(side('Santos').shown.has('in-law')).toBe(true)
    expect(side('Santos').shown.has('dad')).toBe(true)
    expect(side('Santos').shown.has('aunt')).toBe(false)
  })

  it('lists each side once, whatever the spelling, in alphabetical order', () => {
    expect(familySides(buildGraph(people())).map((s) => s.name)).toEqual(['Machado', 'Santos', 'Silva'])
  })

  it('finds a household: parents, brothers and sisters', () => {
    const g = buildGraph(people())
    expect([...household(g, 'me')].sort()).toEqual(['brother', 'dad', 'me', 'mum'])
    expect(household(g, 'nobody').size).toBe(0)
  })

  it('keeps the oldest generations', () => {
    const g = buildGraph(people())
    expect([...oldestGenerations(g, 1)].sort()).toEqual(['grandma', 'grandpa', 'nonno'])
    expect([...oldestGenerations(g, 2)].sort()).toEqual(['aunt', 'dad', 'grandma', 'grandpa', 'in-law', 'mum', 'nonno', 'uncle'])
  })

  it('combines the filters, and lays out what is left', () => {
    const g = buildGraph(people())
    expect(visiblePeople(g, { sides: [], generations: null })).toBeNull()
    expect(visiblePeople(g, { sides: ['Santos', 'Silva', 'Machado'], generations: null })).toBeNull()
    expect(visiblePeople(g, { sides: [], generations: 4 })).toBeNull()
    const visible = visiblePeople(g, { sides: ['Machado'], generations: 2 })!
    expect([...visible].sort()).toEqual(['aunt', 'dad', 'mum', 'nonno'])
    const sub = buildGraph(g.people.filter((p) => visible.has(p.id)))
    expect(sub.byId.get('mum')!.parents).toEqual(['grandpa', 'grandma'])
    expect(computeLayout(sub).positions.size).toBe(4)
  })

  it('finds how two people are related', () => {
    const g = buildGraph(people())
    const cousins = buildGraph([...people(), person('cousin', ['uncle', 'in-law'])])
    expect(relation(g, 'me', 'me')).toBeNull()
    expect(relation(g, 'me', 'nobody')).toBeNull()
    expect(relation(buildGraph([person('a'), person('b')]), 'a', 'b')).toBeNull()

    const toUncle = relation(g, 'me', 'uncle')!
    expect([...toUncle.people].sort()).toEqual(['grandma', 'grandpa', 'me', 'mum', 'uncle'])
    expect(toUncle.steps).toEqual({ up: 2, down: 1, half: false })
    expect(relation(g, 'uncle', 'me')!.steps).toEqual({ up: 1, down: 2, half: false })
    expect(relation(g, 'kid', 'nonno')!.steps).toEqual({ up: 3, down: 0, half: false })
    expect(relation(g, 'me', 'brother')!.steps).toEqual({ up: 1, down: 1, half: false })
    expect(relation(cousins, 'me', 'cousin')!.steps).toEqual({ up: 2, down: 2, half: false })

    expect(relation(g, 'mum', 'dad')).toMatchObject({ partners: true, steps: null })
    const byMarriage = relation(g, 'me', 'in-law')!
    expect(byMarriage.steps).toBeNull()
    expect([...byMarriage.people].sort()).toEqual(['grandma', 'grandpa', 'in-law', 'me', 'mum', 'uncle'])
  })

  it('tells half brothers and sisters apart', () => {
    const g = buildGraph([person('p'), person('q'), person('r'), person('a', ['p', 'q']), person('b', ['p', 'r'])])
    expect(relation(g, 'a', 'b')!.steps).toEqual({ up: 1, down: 1, half: true })
  })

  it('lists a person\'s relatives: blood relatives and partners, not in-laws', () => {
    const g = buildGraph([...people(), person('stranger'), person('stranger-kid', ['stranger'])])
    const mine = relatives(g, 'me')
    expect(mine.has('me')).toBe(false)
    // Mum's side and dad's side, uncle and aunt, brother and child.
    for (const id of ['mum', 'dad', 'grandpa', 'grandma', 'nonno', 'uncle', 'aunt', 'brother', 'kid']) expect(mine.has(id)).toBe(true)
    // The uncle's partner married in: not a relative of mine.
    expect(mine.has('in-law')).toBe(false)
    expect(mine.has('stranger')).toBe(false)
    // A partner is a relative, but their own family is not.
    const mum = relatives(g, 'mum')
    expect(mum.has('dad')).toBe(true)
    expect(mum.has('nonno')).toBe(false)
    expect(mum.has('aunt')).toBe(false)
    expect(relatives(g, 'nobody').size).toBe(0)
  })
})
