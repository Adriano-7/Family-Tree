import type { Person } from '../data/types'
import { initialsOf } from '../scene/textures'
import { asset } from './format'

/** A person's face next to their name, to tell apart people called the same; their initials when there is no photo. */
export function Avatar({ person }: { person: Pick<Person, 'name' | 'thumb'> }) {
  return person.thumb ? (
    <img className="avatar" src={asset(person.thumb)} alt="" loading="lazy" />
  ) : (
    <span className="avatar initials" aria-hidden="true">
      {initialsOf(person.name)}
    </span>
  )
}
