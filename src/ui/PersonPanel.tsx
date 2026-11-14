import { useEffect, useMemo, useRef, useState } from 'react'
import { linkCandidates, type Relative } from '../data/edit'
import { type Graph, partnershipEnd, siblings } from '../data/graph'
import type { Person } from '../data/types'
import { Avatar } from './Avatar'
import { asset, lifeDates, lifeYears } from './format'
import { renderBio } from './bio'
import { AddRelative } from './AddRelative'
import { photosOf } from '../data/photos'
import { Gallery } from './Gallery'
import { personHref } from './hooks'
import { strings } from './strings'

interface Props {
  graph: Graph
  person: Person
  onClose: () => void
  onEdit: () => void
  /** Start a new person who will be this relative, with the name typed so far. */
  onAdd: (relative: Relative, name: string) => void
  /** Make somebody already in the tree this relative. */
  onLink: (relative: Relative, id: string) => Promise<void>
  /** The family sides this person belongs to. */
  sides: string[]
  onShowSide: (name: string) => void
  /** Show only this person's ancestors and descendants. */
  onShowLine: () => void
  /** Start choosing a second person, to see how the two are related. */
  onRelate: () => void
  /** Show everybody connected to this person (a link that can be sent to them). */
  onShowFamily: () => void
}

function Relatives({
  title,
  ids,
  graph,
  note,
}: {
  title: string
  ids: string[]
  graph: Props['graph']
  /** A word about each person, after their years. */
  note?: (id: string) => string | null
}) {
  const people = ids.map((id) => graph.byId.get(id)).filter((p): p is Person => !!p)
  if (!people.length) return null
  return (
    <section className="relatives">
      <h3>{title}</h3>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            <a href={personHref(p.id)}>
              <Avatar person={p} />
              <span>
                {p.name}
                <small>{[lifeYears(p), note?.(p.id)].filter(Boolean).join(' · ')}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PersonPanel({ graph, person, onClose, onEdit, onAdd, onLink, sides, onShowSide, onShowLine, onRelate, onShowFamily }: Props) {
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollTo(0, 0)
  }, [person.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const [adding, setAdding] = useState<Relative | null>(null)
  useEffect(() => setAdding(null), [person.id])
  const candidates = useMemo(() => (adding ? linkCandidates(graph, person.id, adding) : []), [graph, person.id, adding])
  const photos = useMemo(() => photosOf(graph.people, person.id), [graph.people, person.id])
  const dates = lifeDates(person)
  const partners = graph.spouses.get(person.id) ?? []
  const parentCount = person.parents.filter((p) => graph.byId.has(p)).length
  const godparents = (person.godparents ?? []).filter((g) => graph.byId.has(g))
  const godchildren = graph.godchildren.get(person.id) ?? []

  return (
    <aside ref={panel} className="panel" tabIndex={-1} aria-labelledby="person-name">
      <button type="button" className="close" onClick={onClose}>
        {strings.close}
      </button>
      {person.portrait && <img className="portrait" src={asset(person.portrait)} alt="" />}
      <div className="panel-body">
        <h2 id="person-name">{person.name}</h2>
        {person.nickname && <p className="known-as">{strings.knownAs(person.nickname)}</p>}
        {(dates || person.birthplace) && (
          <p className="dates">
            {[dates, person.birthplace && strings.bornIn(person.birthplace)].filter(Boolean).join(', ')}
          </p>
        )}
        {sides.length > 0 && (
          <div className="chips person-sides" role="group" aria-label={strings.sides}>
            {sides.map((name) => (
              <button key={name} type="button" className="chip" title={strings.showSide(name)} onClick={() => onShowSide(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="chips person-views">
          <button type="button" className="chip" title={strings.showFamilyHelp} onClick={onShowFamily}>
            {strings.showFamily}
          </button>
          <button type="button" className="chip" title={strings.showLineHelp} onClick={onShowLine}>
            {strings.showLine}
          </button>
          <button type="button" className="chip" onClick={onRelate}>
            {strings.showRelation}
          </button>
        </div>
        {person.bio && <div className="story" dangerouslySetInnerHTML={{ __html: renderBio(person.bio) }} />}
        {photos.length > 0 && (
          <section>
            <h3>{strings.photos}</h3>
            <Gallery key={person.id} images={photos} nameOf={(id) => graph.byId.get(id)?.name ?? ''} />
          </section>
        )}
        <Relatives title={strings.parents} ids={person.parents} graph={graph} />
        <Relatives
          title={partners.length > 1 ? strings.partners : strings.partner}
          ids={partners}
          graph={graph}
          note={(id) => {
            const end = partnershipEnd(graph, person.id, id)
            if (end === 'separated') return strings.separatedNote
            // Said of whoever lives on: under the partner's name when they are the one still alive.
            return end === 'widowed' && !graph.byId.get(id)?.died ? strings.widowedNote : null
          }}
        />
        <Relatives title={strings.children} ids={graph.children.get(person.id) ?? []} graph={graph} />
        <Relatives title={strings.siblings} ids={siblings(graph, person.id)} graph={graph} />
        <Relatives title={godparents.length > 1 ? strings.godparents : strings.godparent} ids={godparents} graph={graph} />
        <Relatives title={godchildren.length > 1 ? strings.godchildren : strings.godchild} ids={godchildren} graph={graph} />
        {adding ? (
          <AddRelative
            key={adding}
            relative={adding}
            candidates={candidates}
            onLink={async (id) => {
              await onLink(adding, id)
              setAdding(null)
            }}
            onCreate={(name) => onAdd(adding, name)}
            onCancel={() => setAdding(null)}
          />
        ) : (
          <div className="edit-actions">
            <button type="button" className="button" onClick={onEdit}>
              {strings.edit}
            </button>
            <button type="button" className="quiet" onClick={() => setAdding('child')}>
              {strings.addChild}
            </button>
            <button type="button" className="quiet" onClick={() => setAdding('partner')}>
              {strings.addPartner}
            </button>
            {parentCount < 2 && (
              <button type="button" className="quiet" onClick={() => setAdding('parent')}>
                {strings.addParent}
              </button>
            )}
            {parentCount > 0 && (
              <button type="button" className="quiet" onClick={() => setAdding('sibling')}>
                {strings.addSibling}
              </button>
            )}
            <button type="button" className="quiet" onClick={() => setAdding('godparent')}>
              {strings.addGodparent}
            </button>
            <button type="button" className="quiet" onClick={() => setAdding('godchild')}>
              {strings.addGodchild}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
