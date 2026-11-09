import { useId, useMemo, useState } from 'react'
import type { Person } from '../data/types'
import { fold, lifeYears } from './format'
import { strings } from './strings'

interface Props {
  label: string
  /** Everybody who may be chosen. */
  candidates: Person[]
  value: string[]
  onChange: (ids: string[]) => void
  max?: number
}

/** Chosen people as removable tags, plus a box to find and add another. */
export function PeoplePicker({ label, candidates, value, onChange, max = Infinity }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputId = useId()
  const byId = useMemo(() => new Map(candidates.map((p) => [p.id, p])), [candidates])
  const matches = useMemo(() => {
    const q = fold(query.trim())
    if (!q) return []
    return candidates.filter((p) => !value.includes(p.id) && fold(p.name).includes(q)).slice(0, 8)
  }, [candidates, value, query])

  const add = (p: Person | undefined) => {
    if (!p) return
    onChange([...value, p.id])
    setQuery('')
    setActive(0)
  }

  return (
    <div className="field picker">
      <label htmlFor={inputId}>{label}</label>
      {value.length > 0 && (
        <ul className="chosen">
          {value.map((id) => (
            <li key={id}>
              {byId.get(id)?.name ?? id}
              <button
                type="button"
                aria-label={strings.pickerRemove(byId.get(id)?.name ?? id)}
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <div className="picker-input">
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            placeholder={strings.pickerPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                add(matches[active])
              } else if (e.key === 'Escape' && query) {
                e.stopPropagation()
                setQuery('')
              }
            }}
          />
          {query.trim() && (
            <ul className="options">
              {matches.map((p, i) => (
                <li
                  key={p.id}
                  className={i === active ? 'active' : undefined}
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => setActive(i)}
                  onClick={() => add(p)}
                >
                  <span>{p.name}</span>
                  <span className="years">{lifeYears(p)}</span>
                </li>
              ))}
              {matches.length === 0 && <li className="none">{strings.searchNoResults}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
