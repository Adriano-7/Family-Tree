import type { Person } from '../data/types'
import { fold } from './format'

export interface SearchHit {
  person: Person
  /** Where the words were found when the name alone does not show it: the birthplace or a piece of the story. */
  hint?: string
}

const words = (query: string) => fold(query).split(/\s+/).filter(Boolean)

/** Markdown marks would only be noise in a one-line excerpt. */
const plain = (text: string) =>
  text
    .normalize('NFC')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function excerpt(text: string, word: string, around = 28) {
  // Folding an NFC text keeps every letter in its place, so positions carry over.
  const at = fold(text).indexOf(word)
  if (at < 0) return undefined
  let start = Math.max(0, at - around)
  let end = Math.min(text.length, at + word.length + around)
  if (start > 0) start = text.indexOf(' ', start) + 1 || start
  if (end < text.length) end = Math.max(text.lastIndexOf(' ', end), at + word.length)
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}

/**
 * Every word typed has to be found, in any order and anywhere in a word: "ana vieira" finds
 * Ana Cristina Magalhães Vieira. With `everything`, the birthplace, the years and the story count too.
 * People found by name come first.
 */
export function searchPeople(people: Person[], query: string, everything = false): SearchHit[] {
  const wanted = words(query)
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name))
  if (!wanted.length) return sorted.map((person) => ({ person }))

  const byName: SearchHit[] = []
  const byText: SearchHit[] = []
  for (const person of sorted) {
    const name = fold(person.name)
    const missing = wanted.filter((w) => !name.includes(w))
    if (!missing.length) {
      byName.push({ person })
      continue
    }
    if (!everything) continue
    const place = person.birthplace ?? ''
    const bio = plain(person.bio ?? '')
    const rest = fold([place, person.born ?? '', person.died ?? '', bio].join('\n'))
    if (!missing.every((w) => rest.includes(w))) continue
    const inPlace = missing.find((w) => fold(place).includes(w))
    const hint = inPlace ? place : missing.map((w) => excerpt(bio, w)).find(Boolean)
    byText.push({ person, hint })
  }
  return [...byName, ...byText]
}
