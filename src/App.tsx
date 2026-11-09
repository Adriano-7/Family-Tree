import { useEffect, useMemo, useState } from 'react'
import { buildGraph } from './data/graph'
import type { Person } from './data/types'
import peopleJson from './generated/people.json'
import Constellation from './scene/Constellation'
import { computeLayout } from './scene/layout'
import { DISPLAY_FONT, LABEL_FONT } from './scene/textures'
import { useMediaQuery, useSelectedPerson } from './ui/hooks'
import { PersonPanel } from './ui/PersonPanel'
import { Search } from './ui/Search'
import { strings } from './ui/strings'

const people = peopleJson as Person[]

/** Names are painted onto the stars, so wait (briefly) for the fonts before drawing. */
function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const done = () => setReady(true)
    const timeout = setTimeout(done, 2000)
    Promise.all([document.fonts.load(LABEL_FONT), document.fonts.load(`500 92px ${DISPLAY_FONT}`)])
      .catch(() => undefined)
      .then(done)
    return () => clearTimeout(timeout)
  }, [])
  return ready
}

export default function App() {
  const graph = useMemo(() => buildGraph(people), [])
  const layout = useMemo(() => computeLayout(graph), [graph])
  const [overviewRequest, setOverviewRequest] = useState(0)
  const [selectedId, select] = useSelectedPerson()
  const selected = selectedId ? graph.byId.get(selectedId) : undefined
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const wide = useMediaQuery('(min-width: 900px)')
  const fontsReady = useFontsReady()
  const [explored, setExplored] = useState(false)

  useEffect(() => {
    document.title = selected ? `${selected.name} – ${strings.title}` : strings.title
  }, [selected])

  return (
    <div className="app" onPointerDown={() => setExplored(true)}>
      {fontsReady && people.length > 0 && (
        <Constellation
          graph={graph}
          layout={layout}
          overviewRequest={overviewRequest}
          selectedId={selected?.id ?? null}
          onSelect={select}
          reducedMotion={reducedMotion}
          panelBeside={wide && !!selected}
        />
      )}

      <header className="masthead">
        <h1>{strings.title}</h1>
        <p>{people.length ? strings.summary(people.length, graph.generationCount) : strings.empty}</p>
        {people.length > 0 && <Search people={people} onSelect={select} />}
        {people.length > 0 && (
          <button
            type="button"
            className="whole-tree"
            onClick={() => {
              select(null)
              setOverviewRequest((n) => n + 1)
            }}
          >
            {strings.wholeTree}
          </button>
        )}
      </header>

      {people.length > 0 && (
        <footer className="key">
          {!explored && !selected && <p className="hint">{strings.hint}</p>}
          <ul>
            <li>
              <span className="swatch generations" />
              {strings.legendOldest} to {strings.legendYoungest}
            </li>
            <li>
              <span className="swatch line parent" />
              {strings.legendParent}
            </li>
            <li>
              <span className="swatch line partner" />
              {strings.legendPartner}
            </li>
          </ul>
        </footer>
      )}

      {selected && <PersonPanel graph={graph} person={selected} onClose={() => select(null)} />}
      {selectedId && !selected && (
        <p className="notice" role="status">
          {strings.notFound}
        </p>
      )}
    </div>
  )
}
