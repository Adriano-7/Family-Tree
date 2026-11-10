import { useId, useMemo, useState } from 'react'
import type { Relative } from '../data/edit'
import type { Person } from '../data/types'
import { fold, lifeYears } from './format'
import { strings } from './strings'

interface Props {
  relative: Relative
  /** Everybody who may be linked as this relative. */
  candidates: Person[]
  /** Link somebody who is already in the tree. */
  onLink: (id: string) => Promise<void>
  /** Make a new person, starting from what was typed. */
  onCreate: (name: string) => void
  onCancel: () => void
}

/** Find somebody already in the tree to add as a relative, or start a new person. */
export function AddRelative({ relative, candidates, onLink, onCreate, onCancel }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listId = useId()

  const matches = useMemo(() => {
    const q = fold(query.trim())
    if (!q) return []
    return candidates
      .filter((p) => fold(p.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [candidates, query])
  // The matches, then "new person" last: an existing person is usually what is meant.
  const rows = matches.length + 1

  const choose = async (i: number) => {
    if (busy) return
    if (i >= matches.length) return onCreate(query.trim())
    setBusy(true)
    setError('')
    try {
      await onLink(matches[i].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="add-relative">
      <div className="add-relative-head">
        <span>{strings.addTitle[relative]}</span>
        <button type="button" className="quiet" onClick={onCancel}>
          {strings.cancel}
        </button>
      </div>
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-label={strings.addTitle[relative]}
        placeholder={strings.addSearch}
        autoComplete="off"
        value={query}
        disabled={busy}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + rows) % rows)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            void choose(active)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <ul id={listId} role="listbox" className="add-relative-list">
        {matches.map((p, i) => (
          <li
            key={p.id}
            role="option"
            aria-selected={i === active}
            onPointerMove={() => setActive(i)}
            onClick={() => void choose(i)}
          >
            <span>{p.name}</span>
            <span className="years">{lifeYears(p)}</span>
          </li>
        ))}
        <li
          role="option"
          className="create"
          aria-selected={active === matches.length}
          onPointerMove={() => setActive(matches.length)}
          onClick={() => void choose(matches.length)}
        >
          + {query.trim() ? strings.addCreateNamed(query.trim()) : strings.addCreate}
        </li>
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
