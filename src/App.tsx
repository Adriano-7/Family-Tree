import { useCallback, useEffect, useMemo, useState } from 'react'
import { deletePerson, emptyPerson, savePerson } from './data/edit'
import { buildGraph } from './data/graph'
import { createStore } from './data/store'
import type { Person } from './data/types'
import Constellation from './scene/Constellation'
import { computeLayout } from './scene/layout'
import { DISPLAY_FONT, LABEL_FONT } from './scene/textures'
import { useMediaQuery, useSelectedPerson } from './ui/hooks'
import { PersonEditor } from './ui/PersonEditor'
import { PersonPanel } from './ui/PersonPanel'
import { Search } from './ui/Search'
import { strings } from './ui/strings'

const store = createStore()

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
  const [selectedId, select] = useSelectedPerson()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const wide = useMediaQuery('(min-width: 900px)')
  const fontsReady = useFontsReady()
  const [explored, setExplored] = useState(false)

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
  const layout = useMemo(() => computeLayout(graph), [graph])
  const selected = selectedId ? graph.byId.get(selectedId) : undefined
  const count = graph.people.length

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
          graph={graph}
          layout={layout}
          overviewRequest={overviewRequest}
          selectedId={editing ? editing.person.id || null : (selected?.id ?? null)}
          onSelect={(id) => !editing && select(id)}
          reducedMotion={reducedMotion}
          panelBeside={wide && (!!selected || !!editing)}
        />
      )}

      <header className="masthead">
        <h1>{strings.title}</h1>
        <p>
          {people === null
            ? loadFailed
              ? strings.loadFailed
              : strings.loading
            : count
              ? strings.summary(count, graph.generationCount)
              : strings.empty}
        </p>
        {count > 0 && <Search people={graph.people} onSelect={(id) => !editing && select(id)} />}
        {people !== null && (
          <div className="masthead-actions">
            {count > 0 && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  if (!editing) select(null)
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
        />
      ) : (
        selected && (
          <PersonPanel
            graph={graph}
            person={selected}
            onClose={() => select(null)}
            onEdit={() => setEditing({ person: selected })}
            onAdd={startAdd}
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
