import { useEffect, useMemo, useRef, useState } from 'react'
import { cleanFamilies, EditError, slugFor } from '../data/edit'
import { type Graph, lineage, pairKey } from '../data/graph'
import { prepareImage } from '../data/images'
import type { Store } from '../data/store'
import type { Person } from '../data/types'
import { asset } from './format'
import { PeoplePicker } from './PeoplePicker'
import { strings } from './strings'

interface Props {
  graph: Graph
  store: Store
  /** The person being changed, or the starting point for a new one (with an empty id). */
  person: Person
  onSave: (person: Person) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
  /** The family sides that already exist, offered as suggestions. */
  sideNames: string[]
}

/** A photo in the form: already stored (`src`) or just picked and waiting to be uploaded (`blob`). */
interface Photo {
  key: string
  src: string
  blob?: Blob
  caption: string
  width: number
  height: number
}

let photoKey = 0

export function PersonEditor({ graph, store, person, onSave, onCancel, onDelete, sideNames }: Props) {
  const isNew = !person.id
  const [name, setName] = useState(person.name)
  const [born, setBorn] = useState(person.born ?? '')
  const [died, setDied] = useState(person.died ?? '')
  const [birthplace, setBirthplace] = useState(person.birthplace ?? '')
  const [bio, setBio] = useState(person.bio)
  const [parents, setParents] = useState(person.parents.filter((p) => graph.byId.has(p)))
  const [partners, setPartners] = useState(
    isNew ? person.spouses : [...new Set([...(graph.spouses.get(person.id) ?? []), ...person.spouses])],
  )
  const [families, setFamilies] = useState(person.families)
  // Separations either partner recorded.
  const [separated, setSeparated] = useState(() =>
    (graph.spouses.get(person.id) ?? person.spouses).filter((s) => graph.separated.has(pairKey(person.id, s))),
  )
  const [familyDraft, setFamilyDraft] = useState('')
  // `undefined`: keep what is stored. `null`: removed. Otherwise a newly picked photo.
  const [portrait, setPortrait] = useState<{ thumb: Blob; full: Blob; preview: string } | null | undefined>(undefined)
  const [photos, setPhotos] = useState<Photo[]>(() =>
    person.gallery.map((g) => ({ key: `p${photoKey++}`, src: g.src, caption: g.caption, width: g.width, height: g.height })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const previews = useRef<string[]>([])

  useEffect(() => {
    nameInput.current?.focus()
    const made = previews.current
    return () => made.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const preview = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    previews.current.push(url)
    return url
  }

  // Nobody can be their own parent, nor the child of one of their descendants.
  const parentCandidates = useMemo(() => {
    if (isNew) return graph.people
    const below = lineage(graph, person.id).line
    const above = new Set(parents)
    return graph.people.filter((p) => above.has(p.id) || (p.id !== person.id && !below.has(p.id)))
  }, [graph, person.id, isNew, parents])
  const partnerCandidates = useMemo(() => graph.people.filter((p) => p.id !== person.id), [graph, person.id])

  const pickPortrait = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const [thumb, full] = await Promise.all([prepareImage(file, 256, 256, true), prepareImage(file, 900, 1100)])
      setPortrait({ thumb: thumb.blob, full: full.blob, preview: preview(full.blob) })
    } catch {
      setError(strings.errorPhoto)
    }
  }

  const pickPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    try {
      const prepared = await Promise.all([...files].map((f) => prepareImage(f, 1600, 1600)))
      setPhotos((list) => [
        ...list,
        ...prepared.map((p) => ({ key: `p${photoKey++}`, src: preview(p.blob), blob: p.blob, caption: '', width: p.width, height: p.height })),
      ])
    } catch {
      setError(strings.errorPhoto)
    }
  }

  const save = async () => {
    setError('')
    if (!name.trim()) return setError(strings.errorName)
    setBusy(true)
    try {
      const id = person.id || slugFor(name, graph.byId.keys())
      let thumb = person.thumb
      let full = person.portrait
      if (portrait === null) thumb = full = null
      else if (portrait) {
        ;[thumb, full] = await Promise.all([
          store.uploadImage(id, 'thumb', portrait.thumb),
          store.uploadImage(id, 'portrait', portrait.full),
        ])
      }
      const gallery = await Promise.all(
        photos.map(async (p) => ({
          src: p.blob ? await store.uploadImage(id, 'photo', p.blob) : p.src,
          caption: p.caption.trim(),
          width: p.width,
          height: p.height,
        })),
      )
      await onSave({
        id,
        name,
        born: born.trim() || null,
        died: died.trim() || null,
        birthplace: birthplace.trim() || null,
        parents,
        spouses: partners,
        separated: separated.filter((s) => partners.includes(s)),
        // A name typed but not yet confirmed with Enter still counts.
        families: cleanFamilies([...families, familyDraft]),
        thumb,
        portrait: full,
        gallery,
        bio: bio.trim(),
      })
    } catch (e) {
      const reason = e instanceof EditError ? e.reason : null
      setError(
        reason === 'name'
          ? strings.errorName
          : reason === 'date'
            ? strings.errorDate
            : reason === 'loop'
              ? strings.errorLoop
              : e instanceof Error
                ? e.message
                : String(e),
      )
      setBusy(false)
    }
  }

  const portraitSrc = portrait ? portrait.preview : portrait === null ? null : person.portrait && asset(person.portrait)

  return (
    <aside className="panel editor" aria-labelledby="editor-title">
      <form
        className="panel-body"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2 id="editor-title">{isNew ? strings.newPerson : strings.editing(person.name)}</h2>

        <div className="field">
          <label htmlFor="f-name">{strings.fieldName}</label>
          <input id="f-name" ref={nameInput} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="f-born">{strings.fieldBorn}</label>
            <input id="f-born" value={born} onChange={(e) => setBorn(e.target.value)} placeholder="1938" inputMode="numeric" />
          </div>
          <div className="field">
            <label htmlFor="f-died">{strings.fieldDied}</label>
            <input id="f-died" value={died} onChange={(e) => setDied(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <p className="help">{strings.fieldDateHelp}</p>

        <div className="field">
          <label htmlFor="f-place">{strings.fieldBirthplace}</label>
          <input id="f-place" value={birthplace} onChange={(e) => setBirthplace(e.target.value)} />
        </div>

        <PeoplePicker label={strings.fieldParents} candidates={parentCandidates} value={parents} onChange={setParents} max={2} />
        <PeoplePicker
          label={strings.fieldPartners}
          candidates={partnerCandidates}
          value={partners}
          onChange={setPartners}
          tagExtra={(id) => (
            <button
              type="button"
              className="tag-toggle"
              aria-pressed={separated.includes(id)}
              title={strings.separatedHelp}
              onClick={() => setSeparated((list) => (list.includes(id) ? list.filter((s) => s !== id) : [...list, id]))}
            >
              {strings.separatedTag}
            </button>
          )}
        />

        <div className="field picker">
          <label htmlFor="f-families">{strings.fieldFamilies}</label>
          {families.length > 0 && (
            <ul className="chosen">
              {families.map((name) => (
                <li key={name}>
                  {name}
                  <button
                    type="button"
                    aria-label={strings.pickerRemove(name)}
                    onClick={() => setFamilies(families.filter((f) => f !== name))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            id="f-families"
            list="f-families-known"
            autoComplete="off"
            placeholder={strings.familiesPlaceholder}
            value={familyDraft}
            onChange={(e) => setFamilyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ',') return
              e.preventDefault()
              setFamilies(cleanFamilies([...families, familyDraft]))
              setFamilyDraft('')
            }}
          />
          <datalist id="f-families-known">
            {sideNames
              .filter((name) => !families.includes(name))
              .map((name) => (
                <option key={name} value={name} />
              ))}
          </datalist>
          <p className="help">{strings.fieldFamiliesHelp}</p>
        </div>

        <div className="field">
          <label htmlFor="f-story">{strings.fieldStory}</label>
          <textarea id="f-story" rows={7} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={strings.fieldStoryHelp} />
        </div>

        <div className="field">
          <span className="label">{strings.fieldPortrait}</span>
          {portraitSrc && <img className="portrait-preview" src={portraitSrc} alt="" />}
          <div className="actions">
            <label className="button">
              {portraitSrc ? strings.changePortrait : strings.choosePortrait}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  void pickPortrait(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            {portraitSrc && (
              <button type="button" className="quiet" onClick={() => setPortrait(null)}>
                {strings.removePortrait}
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <span className="label">{strings.fieldPhotos}</span>
          {photos.length > 0 && (
            <ul className="photo-list">
              {photos.map((p) => (
                <li key={p.key}>
                  <img src={p.blob ? p.src : asset(p.src)} alt="" />
                  <input
                    aria-label={strings.caption}
                    placeholder={strings.caption}
                    value={p.caption}
                    onChange={(e) =>
                      setPhotos((list) => list.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))
                    }
                  />
                  <button type="button" className="quiet" onClick={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}>
                    {strings.removePhoto}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <label className="button">
              {strings.addPhotos}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  void pickPhotos(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions save-bar">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? strings.saving : strings.save}
          </button>
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            {strings.cancel}
          </button>
        </div>

        {onDelete && (
          <div className="danger">
            {confirmDelete ? (
              <>
                <p>{strings.deleteConfirm(person.name)}</p>
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await onDelete()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e))
                        setBusy(false)
                      }
                    }}
                  >
                    {strings.deleteYes}
                  </button>
                  <button type="button" className="quiet" onClick={() => setConfirmDelete(false)}>
                    {strings.cancel}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="quiet" onClick={() => setConfirmDelete(true)}>
                {strings.deletePerson}
              </button>
            )}
          </div>
        )}
      </form>
    </aside>
  )
}
