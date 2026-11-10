import type { FamilySide, Filter } from '../data/graph'
import { strings } from './strings'

interface Props {
  sides: FamilySide[]
  filter: Filter
  onChange: (filter: Filter) => void
  /** First name of the person the generations are counted from. */
  centreName: string | null
  /** On a narrow screen the choices fold away under a single line. */
  compact: boolean
}

const GENERATION_CHOICES = [1, 2, 3]

/** Which sides of the family, and how many generations, are on show. */
export function Filters({ sides, filter, onChange, centreName, compact }: Props) {
  const toggleSide = (name: string) =>
    onChange({
      ...filter,
      sides: filter.sides.includes(name) ? filter.sides.filter((s) => s !== name) : [...filter.sides, name],
    })
  const active = filter.sides.length + (filter.generations === null ? 0 : 1)

  const body = (
    <>
      <div className="filter" role="group" aria-label={strings.filterSides}>
        <span className="filter-label">{strings.filterSides}</span>
        {sides.length ? (
          <div className="chips">
            <button type="button" className="chip" aria-pressed={!filter.sides.length} onClick={() => onChange({ ...filter, sides: [] })}>
              {strings.filterAllSides}
            </button>
            {sides.map((side) => (
              <button
                key={side.name}
                type="button"
                className="chip"
                aria-pressed={filter.sides.includes(side.name)}
                onClick={() => toggleSide(side.name)}
              >
                {side.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="filter-help">{strings.filterNoSides}</p>
        )}
      </div>
      {centreName && (
        <div className="filter" role="group" aria-label={strings.filterGenerations}>
          <span className="filter-label">{strings.filterGenerations}</span>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={filter.generations === null}
              onClick={() => onChange({ ...filter, generations: null })}
            >
              {strings.filterAllGenerations}
            </button>
            {GENERATION_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={filter.generations === n}
                aria-label={strings.filterGenerationsChoice(n)}
                onClick={() => onChange({ ...filter, generations: n })}
              >
                ±{n}
              </button>
            ))}
          </div>
          {filter.generations !== null && <p className="filter-help">{strings.filterGenerationsAround(centreName)}</p>}
        </div>
      )}
    </>
  )

  if (!compact) return <div className="filters">{body}</div>
  return (
    <details className="filters">
      <summary>{active ? strings.filtersActive(active) : strings.filters}</summary>
      {body}
    </details>
  )
}
