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
