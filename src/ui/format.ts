import type { Person } from '../data/types'

const MONTH_YEAR = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const FULL = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'long', timeZone: 'UTC' })

/** Accepts "1938", "1938-04" or "1938-04-12". */
export function formatDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  if (!m) return String(y)
  const date = new Date(Date.UTC(y, m - 1, d || 1))
  return d ? FULL.format(date) : MONTH_YEAR.format(date)
}

export const yearOf = (value: string | null) => value?.slice(0, 4) ?? ''

export function lifeYears(p: Pick<Person, 'born' | 'died'>) {
  if (p.born && p.died) return `${yearOf(p.born)}–${yearOf(p.died)}`
  if (p.born) return yearOf(p.born)
  if (p.died) return `†${yearOf(p.died)}`
  return ''
}

export function lifeDates(p: Pick<Person, 'born' | 'died'>) {
  if (p.born && p.died) return `${formatDate(p.born)} – ${formatDate(p.died)}`
  if (p.born) return formatDate(p.born)
  if (p.died) return `† ${formatDate(p.died)}`
  return ''
}

/** Photos from the project are relative paths; uploaded ones are complete addresses. */
export const asset = (path: string) => (/^(https?:|data:|blob:)/.test(path) ? path : import.meta.env.BASE_URL + path)

/** What to call somebody in a few letters: the name they go by, otherwise the first one. */
export const callName = (p: Pick<Person, 'name' | 'nickname'>) => p.nickname?.trim() || p.name.trim().split(/\s+/)[0] || p.name

/** The name under a star: first (or preferred) and last name, short enough not to cover the neighbours. */
export function labelName(p: Pick<Person, 'name' | 'nickname'>) {
  const words = p.name.trim().split(/\s+/)
  const last = words.length > 1 ? words[words.length - 1] : ''
  const first = callName(p)
  // A preferred name of several words, or one that already ends in the surname, stands by itself.
  if (!last || (p.nickname && (/\s/.test(first) || fold(first) === fold(last)))) return first
  return `${first} ${last}`
}

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
