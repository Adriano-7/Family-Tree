import bundled from '../generated/people.json'
import { blobToDataUrl } from './images'
import type { Person } from './types'

/** Where the family tree is kept. */
export interface Store {
  /** `online`: a shared database everybody edits. `trial`: this browser only. */
  mode: 'online' | 'trial'
  load(): Promise<Person[]>
  /** Adds or replaces these people. */
  save(people: Person[]): Promise<void>
  remove(id: string): Promise<void>
  /** Stores a picture and returns the address to show it from. */
  uploadImage(personId: string, kind: string, blob: Blob): Promise<string>
  /** Trial mode only: throw away the changes made in this browser. */
  reset?(): void
  hasLocalChanges?(): boolean
}

// ---- trial: the people from the project's files, with edits kept in this browser

const LOCAL_KEY = 'family-tree-trial-v1'

function trialStore(): Store {
  const read = (): Person[] | null => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      return raw ? (JSON.parse(raw) as Person[]) : null
    } catch {
      return null
    }
  }
  // People saved before family sides, separations and godparents existed have no list of them.
  const current = () =>
    (read() ?? (bundled as Person[])).map((p) => ({
      ...p,
      families: p.families ?? [],
      separated: p.separated ?? [],
      godparents: p.godparents ?? [],
    }))
  const write = (people: Person[]) => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(people))
    } catch {
      throw new Error('This browser has no room left to keep the changes. Photos take most of it.')
    }
  }
  return {
    mode: 'trial',
    load: async () => current(),
    save: async (people) => {
      const ids = new Set(people.map((p) => p.id))
      write([...current().filter((p) => !ids.has(p.id)), ...people])
    },
    remove: async (id) => write(current().filter((p) => p.id !== id)),
    uploadImage: (_personId, _kind, blob) => blobToDataUrl(blob),
    reset: () => localStorage.removeItem(LOCAL_KEY),
    hasLocalChanges: () => read() !== null,
  }
}

// ---- online: a Supabase project (see supabase/setup.sql) ----------------------

const BUCKET = 'photos'

function supabaseStore(baseUrl: string, key: string): Store {
  // Accepts the project address with or without the "/rest/v1/" ending the dashboard shows.
  const url = baseUrl.replace(/\/(rest\/v1)?\/*$/, '')
  const auth = { apikey: key, Authorization: `Bearer ${key}` }
  const publicPrefix = `${url}/storage/v1/object/public/${BUCKET}/`
  // The database keeps short paths; the page needs complete addresses.
  const toUrl = (path: string | null) => (path && !/^https?:/.test(path) ? publicPrefix + path : path)
  const toPath = (address: string | null) => (address?.startsWith(publicPrefix) ? address.slice(publicPrefix.length) : address)

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(url + path, { ...init, headers: { ...auth, ...init.headers } })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`The family tree could not be reached (${response.status}). ${detail.slice(0, 200)}`)
    }
    return response
  }

  return {
    mode: 'online',
    async load() {
      const rows = (await (await request('/rest/v1/people?select=*&order=id', {})).json()) as Person[]
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        nickname: row.nickname ?? null,
        born: row.born ?? null,
        died: row.died ?? null,
        birthplace: row.birthplace ?? null,
        parents: row.parents ?? [],
        spouses: row.spouses ?? [],
        separated: row.separated ?? [],
        godparents: row.godparents ?? [],
        families: row.families ?? [],
        thumb: toUrl(row.thumb ?? null),
        portrait: toUrl(row.portrait ?? null),
        gallery: (row.gallery ?? []).map((g) => ({ ...g, src: toUrl(g.src)! })),
        bio: row.bio ?? '',
      }))
    },
    async save(people) {
      if (!people.length) return
      const rows = people.map((p) => ({
        id: p.id,
        name: p.name,
        nickname: p.nickname ?? null,
        born: p.born,
        died: p.died,
        birthplace: p.birthplace,
        parents: p.parents,
        spouses: p.spouses,
        separated: p.separated,
        godparents: p.godparents,
        families: p.families,
        thumb: toPath(p.thumb),
        portrait: toPath(p.portrait),
        gallery: p.gallery.map((g) => ({ ...g, src: toPath(g.src) })),
        bio: p.bio,
      }))
      await request('/rest/v1/people?on_conflict=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
    },
    async remove(id) {
      await request(`/rest/v1/people?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    async uploadImage(personId, kind, blob) {
      const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const path = `${personId}/${kind}-${unique}.webp`
      await request(`/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/webp', 'Cache-Control': 'max-age=31536000' },
        body: blob,
      })
      return publicPrefix + path
    },
  }
}

export function createStore(): Store {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined
  return url && key ? supabaseStore(url, key) : trialStore()
}
