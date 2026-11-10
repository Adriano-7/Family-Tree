import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deletePerson, emptyPerson, savePerson } from './data/edit'
import { HOME_PERSON } from './config'
import { buildGraph, familySides, type Filter, household, visiblePeople } from './data/graph'
import { createStore } from './data/store'
import type { Person } from './data/types'
import Constellation from './scene/Constellation'
import { computeLayout } from './scene/layout'
import { DISPLAY_FONT, LABEL_FONT } from './scene/textures'
import { Filters } from './ui/Filters'
import { useMediaQuery, useSelectedPerson } from './ui/hooks'
import { PersonEditor } from './ui/PersonEditor'
import { PersonPanel } from './ui/PersonPanel'
import { Search } from './ui/Search'
import { strings } from './ui/strings'

const store = createStore()
const NO_FILTER: Filter = { sides: [], generations: null }

/** The form that is open: for an existing person, or a new one (empty id). */
interface Editing {
  person: Person
  /** After saving a new parent, add them to this child. */
  childId?: string
}

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
  const [people, setPeople] = useState<Person[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [trialChanges, setTrialChanges] = useState(() => store.hasLocalChanges?.() ?? false)
  const [overviewRequest, setOverviewRequest] = useState(0)
  const [homeRequest, setHomeRequest] = useState(0)
  const [filter, setFilter] = useState<Filter>(NO_FILTER)
  const [selectedId, select] = useSelectedPerson()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const wide = useMediaQuery('(min-width: 900px)')
  const fontsReady = useFontsReady()
  const [explored, setExplored] = useState(false)
  const masthead = useRef<HTMLElement>(null)
  // Beside the tree on a wide screen, above it on a narrow one.
  const inset = useCallback(() => {
    const box = masthead.current?.getBoundingClientRect()
    if (!box) return { left: 0, top: 0 }
    return window.innerWidth >= 900 ? { left: box.right, top: 0 } : { left: 0, top: box.bottom }
  }, [])

  const load = useCallback(() => {
    store.load().then(
      (loaded) => {
        setPeople(loaded)
        setLoadFailed(false)
      },
      () => setLoadFailed(true),
    )
  }, [])
  useEffect(load, [load])

  // Pick up what the rest of the family changed when coming back to the page.
  const formOpen = editing !== null
  useEffect(() => {
    if (store.mode !== 'online' || formOpen) return
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load, formOpen])

  const graph = useMemo(() => {
    try {
      return buildGraph(people ?? [])
    } catch {
      return buildGraph([])
    }
  }, [people])
  const selected = selectedId ? graph.byId.get(selectedId) : undefined
  const count = graph.people.length
  const home = graph.byId.get(HOME_PERSON)
  const sides = useMemo(() => familySides(graph), [graph])

  // Generations are counted from whoever is open, otherwise from the home person.
  const centre = selected ?? home
  // Somebody opened from outside the chosen sides (a search, a link) is shown anyway.
  const selectedOutside = useMemo(() => {
    if (!selected || !filter.sides.length) return false
    const visible = visiblePeople(graph, filter, selected.id)
    return !!visible && !visible.has(selected.id)
  }, [graph, filter, selected])
  useEffect(() => {
    if (selectedOutside) setFilter((f) => ({ ...f, sides: [] }))
  }, [selectedOutside])
  const view = useMemo(() => {
    const applied = selectedOutside ? { ...filter, sides: [] } : filter
    const visible = visiblePeople(graph, applied, centre?.id ?? null)
    return visible ? buildGraph(graph.people.filter((p) => visible.has(p.id))) : graph
  }, [graph, filter, selectedOutside, centre?.id])
  const layout = useMemo(() => computeLayout(view), [view])
  const homeIds = useMemo(() => [...household(graph, HOME_PERSON)], [graph])

  useEffect(() => {
    document.title = selected ? `${selected.name} – ${strings.title}` : strings.title
  }, [selected])

  const startAdd = (relative?: 'child' | 'partner' | 'parent' | 'sibling') => {
    const person = emptyPerson()
    if (!selected || !relative) return setEditing({ person })
    if (relative === 'child') {
      const partners = graph.spouses.get(selected.id) ?? []
      person.parents = partners.length === 1 ? [selected.id, partners[0]] : [selected.id]
    } else if (relative === 'partner') person.spouses = [selected.id]
    else if (relative === 'sibling') person.parents = selected.parents.filter((p) => graph.byId.has(p))
    setEditing({ person, childId: relative === 'parent' ? selected.id : undefined })
  }

  const commit = async (person: Person) => {
    let result = savePerson(people ?? [], person)
    const changed = [...result.changed]
    const child = editing?.childId ? result.people.find((p) => p.id === editing.childId) : undefined
    if (child) {
      result = savePerson(result.people, { ...child, parents: [...child.parents, person.id] })
      changed.push(...result.changed)
    }
    await store.save(changed)
    setPeople(result.people)
    setTrialChanges(store.hasLocalChanges?.() ?? false)
    setEditing(null)
    select(person.id)
  }

  const remove = async (id: string) => {
    const result = deletePerson(people ?? [], id)
    await store.save(result.changed)
    await store.remove(id)
    setPeople(result.people)
    setTrialChanges(store.hasLocalChanges?.() ?? false)
    setEditing(null)
    select(null)
  }

  return (
    <div className="app" onPointerDown={() => setExplored(true)}>
      {fontsReady && count > 0 && (
        <Constellation
          graph={view}
          layout={layout}
          overviewRequest={overviewRequest}
          homeIds={homeIds}
          homeRequest={homeRequest}
          filterKey={JSON.stringify(filter)}
          generation={graph.generation}
          generationCount={graph.generationCount}
          inset={inset}
          selectedId={editing ? editing.person.id || null : (selected?.id ?? null)}
          onSelect={(id) => !editing && select(id)}
          reducedMotion={reducedMotion}
          panelBeside={wide && (!!selected || !!editing)}
        />
      )}

      <header className="masthead" ref={masthead}>
        <h1>{strings.title}</h1>
        <p>
          {people === null
            ? loadFailed
              ? strings.loadFailed
              : strings.loading
            : count
              ? view === graph
                ? strings.summary(count, graph.generationCount)
                : strings.summaryFiltered(view.people.length, count)
              : strings.empty}
        </p>
        {count > 0 && <Search people={graph.people} onSelect={(id) => !editing && select(id)} />}
        {count > 0 && (
          <Filters
            sides={sides}
            filter={filter}
            onChange={setFilter}
            centreName={centre ? centre.name.split(' ')[0] : null}
            compact={!wide}
          />
        )}
        {people !== null && (
          <div className="masthead-actions">
            {home && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  if (!editing) select(null)
                  setFilter(NO_FILTER)
                  setHomeRequest((n) => n + 1)
                }}
              >
                {strings.myFamily}
              </button>
            )}
            {count > 0 && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  if (!editing) select(null)
                  setFilter(NO_FILTER)
                  setOverviewRequest((n) => n + 1)
                }}
              >
                {strings.wholeTree}
              </button>
            )}
            <button type="button" className="quiet" disabled={!!editing} onClick={() => startAdd()}>
              {strings.addPerson}
            </button>
          </div>
        )}
        {trialChanges && (
          <p className="trial">
            {strings.trialNotice}{' '}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                store.reset?.()
                setTrialChanges(false)
                setEditing(null)
                load()
              }}
            >
              {strings.trialReset}
            </button>
          </p>
        )}
      </header>

      {count > 0 && (
        <footer className="key">
          {!explored && !selected && !editing && <p className="hint">{strings.hint}</p>}
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

      {editing ? (
        <PersonEditor
          key={editing.person.id || 'new'}
          graph={graph}
          store={store}
          person={editing.person}
          onSave={commit}
          onCancel={() => setEditing(null)}
          onDelete={editing.person.id ? () => remove(editing.person.id) : undefined}
          sideNames={sides.map((s) => s.name)}
        />
      ) : (
        selected && (
          <PersonPanel
            graph={graph}
            person={selected}
            onClose={() => select(null)}
            onEdit={() => setEditing({ person: selected })}
            onAdd={startAdd}
            sides={sides.filter((s) => s.line.has(selected.id)).map((s) => s.name)}
            onShowSide={(name) => setFilter((f) => ({ ...f, sides: [name] }))}
          />
        )
      )}
      {people !== null && selectedId && !selected && !editing && (
        <p className="notice" role="status">
          {strings.notFound}
        </p>
      )}
    </div>
  )
}
