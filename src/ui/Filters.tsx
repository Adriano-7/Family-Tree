import type { FamilySide, Filter } from '../data/graph'
import { GenerationsIcon } from './icons'
import { strings } from './strings'

interface Props {
  filter: Filter
  onChange: (filter: Filter) => void
}

/** Which side of the family is on show: one at a time, and pressing it again lets it go. */
export function SideFilter({ sides, filter, onChange }: Props & { sides: FamilySide[] }) {
  if (!sides.length) return null
  return (
    <div className="choices sides" role="group" aria-label={strings.filterSides}>
      {sides.map((side) => (
        <button
          key={side.name}
          type="button"
          aria-pressed={filter.sides.includes(side.name)}
          onClick={() => onChange({ ...filter, sides: filter.sides.includes(side.name) ? [] : [side.name] })}
        >
          {side.name}
        </button>
      ))}
    </div>
  )
}

/** How many generations are on show, counting down from the oldest; the far end of the slider shows them all. */
export function GenerationFilter({ generationCount, filter, onChange }: Props & { generationCount: number }) {
  if (generationCount < 2) return null
  const shown = Math.min(filter.generations ?? generationCount, generationCount)
  const label = shown >= generationCount ? strings.filterAllGenerations : strings.filterGenerationsChoice(shown)
  return (
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
  )
}
