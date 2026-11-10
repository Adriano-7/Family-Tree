import { useCallback, useSyncExternalStore } from 'react'

function subscribeToLocation(notify: () => void) {
  window.addEventListener('hashchange', notify)
  window.addEventListener('popstate', notify)
  return () => {
    window.removeEventListener('hashchange', notify)
    window.removeEventListener('popstate', notify)
  }
}

const readSelected = () => {
  const m = /^#\/p\/([^/?#]+)/.exec(window.location.hash)
  return m ? decodeURIComponent(m[1]) : null
}

export const personHref = (id: string) => `#/p/${encodeURIComponent(id)}`

/** "Magalhães" -> "magalhaes": how a side of the family is written in a link (#/magalhaes). */
export const sideSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * What a shareable address shows, besides whoever is open (that part follows the #):
 *   /machado                      a side of the family
 *   /linhagem/rosa-machado        one person's direct line
 *   /familia/rosa-machado         everybody connected to one person
 *   /parentesco/rosa/adriano      how two people are related
 */
export type AddressView =
  | { kind: 'side'; slug: string }
  | { kind: 'line'; id: string }
  | { kind: 'family'; id: string }
  | { kind: 'relation'; from: string; to: string }
  | null

const LINE = 'linhagem'
const FAMILY = 'familia'
const RELATION = 'parentesco'

export function readAddress(pathname: string): AddressView {
  const parts = pathname
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p).toLowerCase()
      } catch {
        return p.toLowerCase()
      }
    })
  if (parts[0] === LINE) return parts[1] ? { kind: 'line', id: parts[1] } : null
  if (parts[0] === FAMILY) return parts[1] ? { kind: 'family', id: parts[1] } : null
  if (parts[0] === RELATION) return parts[1] && parts[2] ? { kind: 'relation', from: parts[1], to: parts[2] } : null
  return parts[0] ? { kind: 'side', slug: parts[0] } : null
}

export function addressPath(view: AddressView): string {
  if (!view) return '/'
  const e = encodeURIComponent
  if (view.kind === 'line') return `/${LINE}/${e(view.id)}`
  if (view.kind === 'family') return `/${FAMILY}/${e(view.id)}`
  if (view.kind === 'relation') return `/${RELATION}/${e(view.from)}/${e(view.to)}`
  return `/${e(view.slug)}`
}

/** Puts this view in the address without adding a step to the history; whoever is open (after #) stays. */
export function writeAddress(view: AddressView) {
  const wanted = addressPath(view)
  if (window.location.pathname === wanted) return
  history.replaceState(history.state, '', wanted + window.location.search + window.location.hash)
}

/** The selected person lives in the address (#/p/maria-silva), so it can be shared and Back works. */
export function useSelectedPerson() {
  const selectedId = useSyncExternalStore(subscribeToLocation, readSelected)
  const select = useCallback((id: string | null) => {
    if (id) window.location.hash = personHref(id).slice(1)
    else if (window.location.hash) {
      history.pushState(null, '', window.location.pathname + window.location.search)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [])
  return [selectedId, select] as const
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
