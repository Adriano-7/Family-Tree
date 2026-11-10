import type { FamilySide, Filter } from '../data/graph'
import { GenerationsIcon } from './icons'
import { strings } from './strings'

interface Props {
  sides: FamilySide[]
  /** How many generations the whole tree has. */
  generationCount: number
  filter: Filter
  onChange: (filter: Filter) => void
}

/** Which sides of the family, and how many generations, are on show. Pressing a choice again lets it go. */
export function Filters({ sides, generationCount, filter, onChange }: Props) {
  // Counting down from the oldest; the far end of the slider shows every generation.
  const shown = Math.min(filter.generations ?? generationCount, generationCount)
  const label = shown >= generationCount ? strings.filterAllGenerations : strings.filterGenerationsChoice(shown)

  // One side at a time.
  const toggleSide = (name: string) => onChange({ ...filter, sides: filter.sides.includes(name) ? [] : [name] })

  return (
    <>
      {sides.length > 0 && (
        <div className="choices" role="group" aria-label={strings.filterSides}>
          {sides.map((side) => (
            <button key={side.name} type="button" aria-pressed={filter.sides.includes(side.name)} onClick={() => toggleSide(side.name)}>
              {side.name}
            </button>
          ))}
        </div>
      )}
      {generationCount > 1 && (
        <label className="choices generations" title={label}>
          <GenerationsIcon />
          <input
            type="range"
            min={1}
            max={generationCount}
            step={1}
            value={shown}
            aria-label={strings.filterGenerations}
            aria-valuetext={label}
            style={{ '--filled': `${((shown - 1) / (generationCount - 1)) * 100}%` } as React.CSSProperties}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ ...filter, generations: n >= generationCount ? null : n })
            }}
          />
          <output>{shown}</output>
        </label>
      )}
    </>
  )
}
