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

/** The side of the family named in the address (/machado), if any. */
export function sideInAddress(): string | null {
  const first = window.location.pathname.split('/').filter(Boolean)[0]
  return first ? decodeURIComponent(first).toLowerCase() : null
}

/**
 * Writes the side of the family into the address (/machado, or / for none) without adding a
 * step to the history. Whoever is open stays in the part after #, so a shared link can carry both.
 */
export function writeSideToAddress(name: string | null) {
  const wanted = name ? `/${sideSlug(name)}` : '/'
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
