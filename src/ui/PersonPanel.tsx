import { useEffect, useRef } from 'react'
import { type Graph, siblings } from '../data/graph'
import type { Person } from '../data/types'
import { initialsOf } from '../scene/textures'
import { asset, lifeDates, lifeYears } from './format'
import { renderBio } from './bio'
import { Gallery } from './Gallery'
import { personHref } from './hooks'
import { strings } from './strings'

interface Props {
  graph: Graph
  person: Person
  onClose: () => void
  onEdit: () => void
  onAdd: (relative: 'child' | 'partner' | 'parent' | 'sibling') => void
  /** The family sides this person belongs to. */
  sides: string[]
  onShowSide: (name: string) => void
  /** Show only this person's ancestors and descendants. */
  onShowLine: () => void
  /** Start choosing a second person, to see how the two are related. */
  onRelate: () => void
}

function Relatives({ title, ids, graph }: { title: string; ids: string[]; graph: Props['graph'] }) {
  const people = ids.map((id) => graph.byId.get(id)).filter((p): p is Person => !!p)
  if (!people.length) return null
  return (
    <section className="relatives">
      <h3>{title}</h3>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            <a href={personHref(p.id)}>
              {p.thumb ? (
                <img src={asset(p.thumb)} alt="" width={36} height={36} />
              ) : (
                <span className="initials" aria-hidden="true">
                  {initialsOf(p.name)}
                </span>
              )}
              <span>
                {p.name}
                <small>{lifeYears(p)}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PersonPanel({ graph, person, onClose, onEdit, onAdd, sides, onShowSide, onShowLine, onRelate }: Props) {
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollTo(0, 0)
  }, [person.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dates = lifeDates(person)
  const partners = graph.spouses.get(person.id) ?? []
  const parentCount = person.parents.filter((p) => graph.byId.has(p)).length

  return (
    <aside ref={panel} className="panel" tabIndex={-1} aria-labelledby="person-name">
      <button type="button" className="close" onClick={onClose}>
        {strings.close}
      </button>
      {person.portrait && <img className="portrait" src={asset(person.portrait)} alt="" />}
      <div className="panel-body">
        <h2 id="person-name">{person.name}</h2>
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
          <button type="button" className="chip" onClick={onShowLine}>
            {strings.showLine}
          </button>
          <button type="button" className="chip" onClick={onRelate}>
            {strings.showRelation}
          </button>
        </div>
        {person.bio && <div className="story" dangerouslySetInnerHTML={{ __html: renderBio(person.bio) }} />}
        {person.gallery.length > 0 && (
          <section>
            <h3>{strings.photos}</h3>
            <Gallery key={person.id} images={person.gallery} />
          </section>
        )}
        <Relatives title={strings.parents} ids={person.parents} graph={graph} />
        <Relatives title={partners.length > 1 ? strings.partners : strings.partner} ids={partners} graph={graph} />
        <Relatives title={strings.children} ids={graph.children.get(person.id) ?? []} graph={graph} />
        <Relatives title={strings.siblings} ids={siblings(graph, person.id)} graph={graph} />
        <div className="edit-actions">
          <button type="button" className="button" onClick={onEdit}>
            {strings.edit}
          </button>
          <button type="button" className="quiet" onClick={() => onAdd('child')}>
            {strings.addChild}
          </button>
          <button type="button" className="quiet" onClick={() => onAdd('partner')}>
            {strings.addPartner}
          </button>
          {parentCount < 2 && (
            <button type="button" className="quiet" onClick={() => onAdd('parent')}>
              {strings.addParent}
            </button>
          )}
          {parentCount > 0 && (
            <button type="button" className="quiet" onClick={() => onAdd('sibling')}>
              {strings.addSibling}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
