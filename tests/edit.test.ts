import { describe, expect, it } from 'vitest'
import { deletePerson, EditError, emptyPerson, savePerson, slugFor } from '../src/data/edit'

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

describe('deletePerson', () => {
  it('removes the person and every mention of them', () => {
    const start = [person('a', { spouses: ['b'] }), person('b'), person('c', { parents: ['a', 'b'] })]
    const { people, changed } = deletePerson(start, 'a')
    expect(people.map((p) => p.id)).toEqual(['b', 'c'])
    expect(people.find((p) => p.id === 'c')!.parents).toEqual(['b'])
    expect(changed.map((p) => p.id)).toEqual(['c'])
  })
})
