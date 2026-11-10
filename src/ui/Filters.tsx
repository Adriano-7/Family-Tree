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

/** Width in pixels of the area that takes hold of a slider handle (see the stylesheet). */
const HANDLE = 27

/**
 * Which generations are on show: a stretch of the tree, from the left handle (the oldest shown)
 * to the right one (the youngest). With both at the ends, everybody is shown.
 */
export function GenerationFilter({ generationCount, filter, onChange }: Props & { generationCount: number }) {
  if (generationCount < 2) return null
  const top = generationCount - 1
  const last = Math.min(filter.generations?.[1] ?? top, top)
  const first = Math.min(filter.generations?.[0] ?? 0, last)
  const all = first === 0 && last === top
  const label = all ? strings.filterAllGenerations : strings.filterGenerationsChoice(first + 1, last + 1)
  const change = (from: number, to: number) =>
    onChange({ ...filter, generations: from <= 0 && to >= top ? null : [from, to] })
  const handle = (value: number, name: string, move: (n: number) => void, onTop: boolean) => (
    <input
      type="range"
      min={1}
      max={generationCount}
      step={1}
      value={value + 1}
      aria-label={name}
      aria-valuetext={label}
      style={onTop ? { zIndex: 1 } : undefined}
      onChange={(e) => move(Number(e.target.value) - 1)}
    />
  )
  return (
    <div className="choices generations" role="group" aria-label={strings.filterGenerations} title={label}>
      <GenerationsIcon />
      <div
        className="range"
        // A touch on the line itself brings the nearer handle there (the handles take their own touches).
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return
          const box = e.currentTarget.getBoundingClientRect()
          const n = Math.round(Math.min(Math.max((e.clientX - box.left - HANDLE / 2) / (box.width - HANDLE), 0), 1) * top)
          if (Math.abs(n - first) < Math.abs(n - last) || (n < first && first === last)) change(n, last)
          else change(first, n)
        }}
        style={{ '--from': `${(first / top) * 100}%`, '--to': `${(last / top) * 100}%` } as React.CSSProperties}
      >
        {/* When the two handles meet at the far end, the one that can still move has to be the one on top. */}
        {handle(first, strings.filterOldestGeneration, (n) => change(Math.min(n, last), last), first === last && last === top)}
        {handle(last, strings.filterYoungestGeneration, (n) => change(first, Math.max(n, first)), false)}
      </div>
      <output>{first === last ? first + 1 : `${first + 1}–${last + 1}`}</output>
    </div>
  )
}
