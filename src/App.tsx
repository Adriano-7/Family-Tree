import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deletePerson, emptyPerson, savePerson } from './data/edit'
import { HOME_PERSON } from './config'
import { buildGraph, familySides, type Filter, household, lineage, relation, relatives, visiblePeople } from './data/graph'
import { createStore } from './data/store'
import type { Person } from './data/types'
import Constellation from './scene/Constellation'
import { computeLayout } from './scene/layout'
import { DISPLAY_FONT, LABEL_FONT } from './scene/textures'
import { GenerationFilter, SideFilter } from './ui/Filters'
import { useMediaQuery, useSelectedPerson } from './ui/hooks'
import { HomeIcon, PlusIcon, WholeTreeIcon } from './ui/icons'
import { kinshipName } from './ui/kinship'
import { PersonEditor } from './ui/PersonEditor'
import { PersonPanel } from './ui/PersonPanel'
import { Search } from './ui/Search'
import { strings } from './ui/strings'

const store = createStore()
const NO_FILTER: Filter = { sides: [], generations: null }

/** A closer look that replaces the filters: one person's direct line, or the way between two people. */
type Focus = { kind: 'line'; id: string } | { kind: 'relation'; from: string; to: string }

interface Labels {
  surname: boolean
  years: boolean
}
const LABELS_KEY = 'family-tree-labels'
function storedLabels(): Labels {
  try {
    const saved = JSON.parse(localStorage.getItem(LABELS_KEY) ?? '{}') as Partial<Labels>
    return { surname: !!saved.surname, years: !!saved.years }
  } catch {
    return { surname: false, years: false }
  }
}

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
  const [focus, setFocus] = useState<Focus | null>(null)
  /** The first of two people whose relationship is being asked for; the next person picked is the second. */
  const [relatingFrom, setRelatingFrom] = useState<string | null>(null)
  const [labels, setLabels] = useState(storedLabels)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const labelsMenu = useRef<HTMLDivElement>(null)
  const [selectedId, select] = useSelectedPerson()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const wide = useMediaQuery('(min-width: 900px)')
  const fontsReady = useFontsReady()
  const masthead = useRef<HTMLElement>(null)
  const dock = useRef<HTMLElement>(null)
  // What the tree should stay clear of: the controls below and, on a narrow screen, the title above.
  const inset = useCallback(() => {
    const top = window.innerWidth >= 900 ? 0 : (masthead.current?.getBoundingClientRect().bottom ?? 0)
    const bar = dock.current?.getBoundingClientRect()
    return { top, bottom: bar ? window.innerHeight - bar.top : 0 }
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

  const related = useMemo(
    () => (focus?.kind === 'relation' ? relation(graph, focus.from, focus.to) : null),
    [graph, focus],
  )
  // Who is on show: the focus if there is one, otherwise what the filters leave.
  // While choosing the second person, only the first one's relatives (and partners) can be chosen.
  const relatable = useMemo(() => (relatingFrom ? relatives(graph, relatingFrom) : null), [graph, relatingFrom])
  // Who is on show: while choosing, the first person and their relatives; then the focus if
  // there is one; otherwise what the filters leave.
  const visible = useMemo(() => {
    if (relatingFrom && relatable) return new Set([relatingFrom, ...relatable])
    if (focus?.kind === 'line') {
      const { shown } = lineage(graph, focus.id)
      if (shown.size) return shown
    }
    if (related) return related.people
    return visiblePeople(graph, filter)
  }, [graph, filter, focus, related, relatingFrom, relatable])
  // Somebody opened from outside it (a search, a link) is shown anyway.
  const selectedOutside = !!selected && !!visible && !visible.has(selected.id)
  useEffect(() => {
    if (!selectedOutside) return
    setFilter(NO_FILTER)
    setFocus(null)
  }, [selectedOutside])
  const view = useMemo(
    () => (visible && !selectedOutside ? buildGraph(graph.people.filter((p) => visible.has(p.id))) : graph),
    [graph, visible, selectedOutside],
  )
  const layout = useMemo(() => computeLayout(view), [view])
  // Choosing a filter that hides the open person closes that person, so the choice is not undone.
  const changeFilter = (next: Filter) => {
    if (selected && !editing) {
      const shown = visiblePeople(graph, next)
      if (shown && !shown.has(selected.id)) select(null)
    }
    setFocus(null)
    setFilter(next)
  }
  const clearFocus = () => {
    setFocus(null)
    setRelatingFrom(null)
  }
  const searchable = useMemo(
    () => (relatable ? graph.people.filter((p) => relatable.has(p.id)) : graph.people),
    [graph, relatable],
  )
  // Likewise the family sides: only those the first person belongs to.
  const choosableSides = useMemo(
    () => (relatingFrom ? sides.filter((side) => side.line.has(relatingFrom)) : sides),
    [sides, relatingFrom],
  )
  /** A person was clicked or found: open them, or make them the second of the two being compared. */
  const pick = (id: string) => {
    if (editing) return
    if (relatable && !relatable.has(id) && id !== relatingFrom) return
    if (!relatingFrom || relatingFrom === id) return select(id)
    setFilter(NO_FILTER)
    setFocus({ kind: 'relation', from: relatingFrom, to: id })
    setRelatingFrom(null)
  }
  const firstName = (id: string) => graph.byId.get(id)?.name.split(' ')[0] ?? ''
  const kin = related && kinshipName(related)

  useEffect(() => {
    try {
      localStorage.setItem(LABELS_KEY, JSON.stringify(labels))
    } catch {
      // Without storage the choice simply lasts for this visit.
    }
  }, [labels])
  useEffect(() => {
    if (!labelsOpen) return
    const close = (e: PointerEvent) => !labelsMenu.current?.contains(e.target as Node) && setLabelsOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [labelsOpen])

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
    <div className={selected || editing ? 'app with-panel' : 'app'}>
      {fontsReady && count > 0 && (
        <Constellation
          graph={view}
          layout={layout}
          overviewRequest={overviewRequest}
          homeIds={homeIds}
          homeRequest={homeRequest}
          filterKey={JSON.stringify([filter, focus, relatingFrom])}
          generation={graph.generation}
          generationCount={graph.generationCount}
          inset={inset}
          labels={labels}
          selectedId={editing ? editing.person.id || null : (selected?.id ?? null)}
          onSelect={pick}
          reducedMotion={reducedMotion}
          panelBeside={wide && (!!selected || !!editing)}
        />
      )}

      <header className="masthead" ref={masthead}>
        <div className="title">
          <h1>{strings.title}</h1>
          {count > 0 && (
            <span className="count" aria-live="polite">
              {view.people.length < count ? strings.shownOf(view.people.length, count) : strings.people(count)}
            </span>
          )}
        </div>
        {count === 0 && (
          <p>{people === null ? (loadFailed ? strings.loadFailed : strings.loading) : strings.empty}</p>
        )}
        {count > 0 && <Search people={searchable} onSelect={pick} />}
        {count > 0 && <SideFilter sides={choosableSides} filter={filter} onChange={changeFilter} />}
        {(focus || relatingFrom) && (
          <div className="focus" role="status">
            <span>
              {relatingFrom
                ? `${firstName(relatingFrom)} ↔ ${strings.relationPick}`
                : focus!.kind === 'line'
                  ? strings.lineOf(firstName(focus!.id))
                  : `${firstName(focus!.from)} ↔ ${firstName(focus!.to)}`}
              {!relatingFrom && focus?.kind === 'relation' && (
                <small>
                  {!related ? strings.relationNone : kin && strings.relationIs(firstName(focus.to), kin, firstName(focus.from))}
                </small>
              )}
            </span>
            <button type="button" aria-label={strings.clearFocus} title={strings.clearFocus} onClick={clearFocus}>
              ×
            </button>
          </div>
        )}
        {trialChanges && (
          <p className="trial">
            {strings.trialNotice}
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

      {people !== null && (
        <nav className="dock" ref={dock} aria-label={strings.dock}>
          {home && (
            <button
              type="button"
              className="icon"
              aria-label={strings.myFamily}
              title={strings.myFamily}
              onClick={() => {
                if (!editing) select(null)
                setFilter(NO_FILTER)
                clearFocus()
                setHomeRequest((n) => n + 1)
              }}
            >
              <HomeIcon />
            </button>
          )}
          {count > 0 && (
            <>
              <button
                type="button"
                className="icon"
                aria-label={strings.wholeTree}
                title={strings.wholeTree}
                onClick={() => {
                  if (!editing) select(null)
                  setFilter(NO_FILTER)
                  clearFocus()
                  setOverviewRequest((n) => n + 1)
                }}
              >
                <WholeTreeIcon />
              </button>
              <GenerationFilter generationCount={graph.generationCount} filter={filter} onChange={changeFilter} />
            </>
          )}
          {count > 0 && (
            <button
              type="button"
              className="icon text"
              aria-label={strings.labels}
              title={strings.labels}
              aria-expanded={labelsOpen}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setLabelsOpen((open) => !open)}
            >
              Aa
            </button>
          )}
          <button
            type="button"
            className="icon"
            aria-label={strings.addPerson}
            title={strings.addPerson}
            disabled={!!editing}
            onClick={() => startAdd()}
          >
            <PlusIcon />
          </button>
        </nav>
      )}
      {labelsOpen && (
        <div className="menu" ref={labelsMenu} role="menu" aria-label={strings.labels}>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={labels.surname}
            onClick={() => setLabels((l) => ({ ...l, surname: !l.surname }))}
          >
            {strings.labelSurname}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={labels.years}
            onClick={() => setLabels((l) => ({ ...l, years: !l.years }))}
          >
            {strings.labelYears}
          </button>
        </div>
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
            onShowSide={(name) => {
              changeFilter({ ...filter, sides: [name] })
              // On a narrow screen the panel covers the tree: close it so the change can be seen.
              if (!wide) select(null)
            }}
            onShowLine={() => {
              setFilter(NO_FILTER)
              setRelatingFrom(null)
              setFocus({ kind: 'line', id: selected.id })
              // Close the panel, so the camera takes in the whole line (and, on a phone, it can be seen at all).
              select(null)
            }}
            onRelate={() => {
              setFocus(null)
              setRelatingFrom(selected.id)
              select(null)
            }}
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
