import { describe, expect, it } from 'vitest'
import type { Person } from '../src/data/types'
import { searchPeople } from '../src/ui/search'

const person = (name: string, extra: Partial<Person> = {}) =>
  ({ id: name, name, born: null, died: null, birthplace: null, bio: '', ...extra }) as Person

const people = [
  person('Ana Cristina Magalhães Vieira'),
  person('Rosa Machado', { born: '1938-04-12', birthplace: 'Amarante', bio: 'Foi **costureira** toda a vida, em São Gonçalo.' }),
  person('António Machado'),
]
const names = (query: string, everything = false) => searchPeople(people, query, everything).map((h) => h.person.name)

describe('searchPeople', () => {
  it('lists everyone, by name, when nothing is typed', () => {
    expect(names('  ')).toEqual(['Ana Cristina Magalhães Vieira', 'António Machado', 'Rosa Machado'])
  })

  it('finds any part of the name, in any order, without accents', () => {
    expect(names('magalhaes')).toEqual(['Ana Cristina Magalhães Vieira'])
    expect(names('vieira ana')).toEqual(['Ana Cristina Magalhães Vieira'])
    expect(names('ant mach')).toEqual(['António Machado'])
    expect(names('ana machado')).toEqual([])
  })

  it('reads the rest of the person only when asked', () => {
    expect(names('amarante')).toEqual([])
    expect(names('amarante', true)).toEqual(['Rosa Machado'])
    expect(names('1938', true)).toEqual(['Rosa Machado'])
    expect(names('machado costureira', true)).toEqual(['Rosa Machado'])
  })

  it('says where it found the words, names first', () => {
    const hits = searchPeople([...people, person('Zé', { bio: 'Sobrinho da Rosa.' })], 'rosa', true)
    expect(hits.map((h) => h.person.name)).toEqual(['Rosa Machado', 'Zé'])
    expect(hits[0].hint).toBeUndefined()
    expect(hits[1].hint).toBe('Sobrinho da Rosa.')
    expect(searchPeople(people, 'goncalo', true)[0].hint).toBe('…toda a vida, em São Gonçalo.')
    expect(searchPeople(people, 'amarante', true)[0].hint).toBe('Amarante')
  })
})
