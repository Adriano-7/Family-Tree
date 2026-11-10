import { describe, expect, it } from 'vitest'
import { deletePerson, EditError, emptyPerson, linkCandidates, linkExisting, savePerson, slugFor } from '../src/data/edit'
import { buildGraph } from '../src/data/graph'

const person = (id: string, more: Partial<ReturnType<typeof emptyPerson>> = {}) => ({ ...emptyPerson(), id, name: id, ...more })

describe('slugFor', () => {
  it('makes a plain id from a name', () => {
    expect(slugFor('  Íris da Conceição ', [])).toBe('iris-da-conceicao')
    expect(slugFor('???', [])).toBe('person')
  })
  it('adds a number when the id is taken', () => {
    expect(slugFor('Ana Santos', ['ana-santos', 'ana-santos-2'])).toBe('ana-santos-3')
  })
})

describe('savePerson', () => {
  it('adds a new person and replaces an existing one', () => {
    const start = [person('a')]
    const added = savePerson(start, person('b', { parents: ['a'] }))
    expect(added.people.map((p) => p.id).sort()).toEqual(['a', 'b'])
    expect(added.changed.map((p) => p.id)).toEqual(['b'])
    const renamed = savePerson(added.people, { ...person('b'), name: ' Bea ' })
    expect(renamed.people.find((p) => p.id === 'b')).toMatchObject({ name: 'Bea', parents: [] })
    expect(renamed.people).toHaveLength(2)
  })

  it('removes the link on the other side when a partner is taken away', () => {
    const start = [person('a', { spouses: ['b'] }), person('b', { spouses: ['a'] })]
    const { people, changed } = savePerson(start, person('a', { spouses: [] }))
    expect(people.find((p) => p.id === 'b')!.spouses).toEqual([])
    expect(changed.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('refuses an empty name, a bad date and a person who would be their own ancestor', () => {
    const reason = (run: () => unknown) => {
      try {
        run()
      } catch (e) {
        return (e as EditError).reason
      }
    }
    expect(reason(() => savePerson([], person('a', { name: '  ' })))).toBe('name')
    expect(reason(() => savePerson([], person('a', { born: '12/04/1938' })))).toBe('date')
    const start = [person('a'), person('b', { parents: ['a'] })]
    expect(reason(() => savePerson(start, person('a', { parents: ['b'] })))).toBe('loop')
  })

  it('never lists someone as their own parent or partner', () => {
    const { people } = savePerson([], person('a', { parents: ['a'], spouses: ['a', 'a'] }))
    expect(people[0]).toMatchObject({ parents: [], spouses: [] })
  })
})

describe('family sides', () => {
  it('tidies the names of the sides that start with a person', () => {
    const { people } = savePerson([], person('a', { families: [' Machado ', 'machado', '', 'Santos  Silva'] }))
    expect(people[0].families).toEqual(['Machado', 'Santos Silva'])
  })
})

describe('separations', () => {
  it('keeps only partners as separated, and clears a separation on both sides', () => {
    const start = [person('a', { spouses: ['b'] }), person('b', { separated: ['a'] })]
    const kept = savePerson(start, person('a', { spouses: ['b'], separated: ['b', 'z'] }))
    expect(kept.people.find((p) => p.id === 'a')!.separated).toEqual(['b'])
    const undone = savePerson(start, person('a', { spouses: ['b'], separated: [] }))
    expect(undone.people.find((p) => p.id === 'b')!.separated).toEqual([])
    expect(undone.changed.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('forgets a deleted person in separations too', () => {
    const { people } = deletePerson([person('a'), person('b', { separated: ['a'] })], 'a')
    expect(people[0].separated).toEqual([])
  })
})

describe('deletePerson', () => {
  it('removes the person and every mention of them', () => {
    const start = [person('a', { spouses: ['b'] }), person('b'), person('c', { parents: ['a', 'b'] })]
    const { people, changed } = deletePerson(start, 'a')
    expect(people.map((p) => p.id)).toEqual(['b', 'c'])
    expect(people.find((p) => p.id === 'c')!.parents).toEqual(['b'])
    expect(changed.map((p) => p.id)).toEqual(['c'])
  })
})

describe('linking somebody already in the tree', () => {
  const family = () => [
    person('grandma'),
    person('mum', { parents: ['grandma'], spouses: ['dad'] }),
    person('dad'),
    person('me', { parents: ['mum', 'dad'] }),
    person('loner'),
    person('cousin', { parents: ['aunt', 'uncle'] }),
    person('aunt'),
    person('uncle'),
  ]
  const ids = (list: { id: string }[]) => list.map((p) => p.id).sort()

  it('offers only people who fit', () => {
    const g = buildGraph(family())
    // Not an ancestor, not somebody with two parents already.
    expect(ids(linkCandidates(g, 'mum', 'child'))).toEqual(['aunt', 'dad', 'loner', 'uncle'])
    // Not a descendant; and "me" already has two parents, so nobody is offered.
    expect(ids(linkCandidates(g, 'me', 'parent'))).toEqual([])
    expect(ids(linkCandidates(g, 'mum', 'partner'))).not.toContain('dad')
    // A sibling must have no parents of their own yet, and cannot be one of my parents.
    expect(ids(linkCandidates(g, 'me', 'sibling'))).toEqual(['aunt', 'loner', 'uncle'])
  })

  it('changes the one record that makes the link', () => {
    const people = family()
    const g = buildGraph(people)
    const get = (id: string) => people.find((p) => p.id === id)!
    // A child with no parents gets both, when there is just one partner.
    expect(linkExisting(g, get('mum'), 'child', get('loner'))).toMatchObject({ id: 'loner', parents: ['mum', 'dad'] })
    expect(linkExisting(g, get('loner'), 'partner', get('aunt'))).toMatchObject({ id: 'loner', spouses: ['aunt'] })
    expect(linkExisting(g, get('loner'), 'parent', get('aunt'))).toMatchObject({ id: 'loner', parents: ['aunt'] })
    expect(linkExisting(g, get('me'), 'sibling', get('loner'))).toMatchObject({ id: 'loner', parents: ['mum', 'dad'] })
  })

  it('keeps partners only the other person wrote down', () => {
    const people = [person('eliseu'), person('alexandra', { spouses: ['eliseu'], separated: ['eliseu'] }), person('adao')]
    const g = buildGraph(people)
    const get = (id: string) => people.find((p) => p.id === id)!
    const result = savePerson(people, linkExisting(g, get('eliseu'), 'parent', get('adao')))
    expect(result.people.find((p) => p.id === 'eliseu')).toMatchObject({ parents: ['adao'], spouses: ['alexandra'] })
    expect(result.people.find((p) => p.id === 'alexandra')).toMatchObject({ spouses: ['eliseu'], separated: ['eliseu'] })
  })
})

describe('photos shared between people', () => {
  const photo = (src: string, withIds?: string[]) => ({ src, caption: '', width: 1, height: 1, ...(withIds ? { with: withIds } : {}) })

  it('shows a photo to everybody tagged in it', async () => {
    const { photosOf, peopleIn } = await import('../src/data/photos')
    const people = [
      person('ana', { gallery: [photo('a.webp', ['rui', 'eva']), photo('b.webp')] }),
      person('rui', { gallery: [photo('r.webp')] }),
      person('eva'),
    ]
    expect(photosOf(people, 'rui').map((p) => [p.owner, p.src])).toEqual([
      ['rui', 'r.webp'],
      ['ana', 'a.webp'],
    ])
    expect(photosOf(people, 'eva').map((p) => p.src)).toEqual(['a.webp'])
    expect(peopleIn(photosOf(people, 'eva')[0])).toEqual(['ana', 'rui', 'eva'])
  })

  it('tidies the tags, and forgets a deleted person in them', () => {
    const saved = savePerson([], person('ana', { gallery: [photo('a.webp', ['rui', 'rui', 'ana'])] }))
    expect(saved.people[0].gallery[0].with).toEqual(['rui'])
    const { people, changed } = deletePerson([person('ana', { gallery: [photo('a.webp', ['rui'])] }), person('rui')], 'rui')
    expect(people[0].gallery[0].with).toEqual([])
    expect(changed.map((p) => p.id)).toEqual(['ana'])
  })
})

describe('godparents', () => {
  it('lists godchildren from the godparents written on the godchild', () => {
    const graph = buildGraph([person('a'), person('b', { godparents: ['a'] }), person('c', { godparents: ['a', 'c'] })])
    expect(graph.godchildren.get('a')).toEqual(['b', 'c'])
    expect(graph.godchildren.get('c')).toEqual([])
  })

  it('links somebody already in the tree as a godparent or a godchild', () => {
    const graph = buildGraph([person('a'), person('b'), person('c', { godparents: ['a'] })])
    expect(linkExisting(graph, graph.byId.get('a')!, 'godparent', graph.byId.get('b')!)).toMatchObject({ id: 'a', godparents: ['b'] })
    expect(linkExisting(graph, graph.byId.get('b')!, 'godchild', graph.byId.get('c')!)).toMatchObject({ id: 'c', godparents: ['a', 'b'] })
    expect(linkCandidates(graph, 'a', 'godchild').map((p) => p.id)).toEqual(['b'])
    expect(linkCandidates(graph, 'c', 'godparent').map((p) => p.id)).toEqual(['b'])
  })

  it('forgets a godparent who is deleted', () => {
    const { people, changed } = deletePerson([person('a'), person('b', { godparents: ['a'] })], 'a')
    expect(people[0].godparents).toEqual([])
    expect(changed.map((p) => p.id)).toEqual(['b'])
  })
})
