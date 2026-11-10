import { useId, useMemo, useRef, useState } from 'react'
import type { Person } from '../data/types'
import { fold, lifeYears } from './format'
import { SearchIcon } from './icons'
import { strings } from './strings'

interface Props {
  people: Person[]
  onSelect: (id: string) => void
}

/** Doubles as the keyboard route to every person: with nothing typed it lists everyone. */
export function Search({ people, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)

  const sorted = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people])
  const results = useMemo(() => {
    const q = fold(query.trim())
    return q ? sorted.filter((p) => fold(p.name).includes(q)) : sorted
  }, [sorted, query])

  const choose = (p: Person | undefined) => {
    if (!p) return
    onSelect(p.id)
    setQuery('')
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <SearchIcon />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label={strings.searchLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        aria-autocomplete="list"
        placeholder={strings.searchPlaceholder}
        autoComplete="off"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActive((i) => (results.length ? (i + step + results.length) % results.length : 0))
          } else if (e.key === 'Enter') choose(results[active])
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={strings.searchLabel}>
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              role="option"
              aria-selected={i === active}
              ref={(el) => {
                if (el && i === active) el.scrollIntoView({ block: 'nearest' })
              }}
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(p)}
            >
              <span>{p.name}</span>
              <span className="years">{lifeYears(p)}</span>
            </li>
          ))}
          {results.length === 0 && <li className="none">{strings.searchNoResults}</li>}
        </ul>
      )}
    </div>
  )
}
