import type { Person } from '../data/types'

const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
const FULL = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' })

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

export const asset = (path: string) => import.meta.env.BASE_URL + path

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
