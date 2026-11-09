// Turns content/people/*.md and content/photos/<id>/* into
// src/generated/people.json and optimised images in public/photos.
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import sharp from 'sharp'

const contentDir = path.resolve(process.env.CONTENT_DIR ?? 'content')
const outJson = path.resolve(process.env.CONTENT_OUT_JSON ?? 'src/generated/people.json')
const outPhotos = path.resolve(process.env.CONTENT_OUT_PHOTOS ?? 'public/photos')
const peopleDir = path.join(contentDir, 'people')
const photosDir = path.join(contentDir, 'photos')

const errors = []
const fail = (file, message) => errors.push(`${file}: ${message}`)

const exists = (p) => fs.access(p).then(() => true, () => false)

function normaliseDate(value, field, file) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value).trim()
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s
  fail(file, `"${field}" should look like 1938, 1938-04 or 1938-04-12 (found "${s}")`)
  return null
}

function idList(value, field, file) {
  if (value == null) return []
  const list = Array.isArray(value) ? value : [value]
  const out = []
  for (const v of list) {
    if (typeof v !== 'string' || !v.trim()) fail(file, `"${field}" must be a list of person file names`)
    else out.push(v.trim().replace(/\.md$/, ''))
  }
  return [...new Set(out)]
}

// ---- read people -----------------------------------------------------------

if (!(await exists(peopleDir))) {
  // Fine when the family tree lives in the online database: the site then starts from nothing here.
  console.log(`content: no people folder at ${peopleDir}, writing an empty list`)
  await fs.mkdir(path.dirname(outJson), { recursive: true })
  await fs.writeFile(outJson, '[]\n')
  process.exit(0)
}

const files = (await fs.readdir(peopleDir)).filter((f) => f.endsWith('.md')).sort()
const raw = []
for (const file of files) {
  const id = file.slice(0, -3)
  const label = `content/people/${file}`
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(label, 'file name may only use lowercase letters, numbers and hyphens (e.g. maria-silva.md)')
    continue
  }
  let parsed
  try {
    parsed = matter(await fs.readFile(path.join(peopleDir, file), 'utf8'))
  } catch (e) {
    fail(label, `could not read the header between the --- lines (${e.reason ?? e.message})`)
    continue
  }
  const d = parsed.data
  if (typeof d.name !== 'string' || !d.name.trim()) {
    fail(label, '"name" is required')
    continue
  }
  const gallery = []
  for (const g of Array.isArray(d.gallery) ? d.gallery : d.gallery ? [d.gallery] : []) {
    if (typeof g === 'string') gallery.push({ file: g, caption: '' })
    else if (g && typeof g.file === 'string') gallery.push({ file: g.file, caption: String(g.caption ?? '') })
    else fail(label, 'each gallery entry needs a "file"')
  }
  raw.push({
    id,
    label,
    name: d.name.trim(),
    born: normaliseDate(d.born, 'born', label),
    died: normaliseDate(d.died, 'died', label),
    birthplace: d.birthplace ? String(d.birthplace) : null,
    parents: idList(d.parents, 'parents', label),
    spouses: idList(d.spouses, 'spouses', label),
    portrait: d.portrait ? String(d.portrait) : null,
    gallery,
    bio: parsed.content.trim(),
  })
}

// ---- validate relationships -----------------------------------------------

const byId = new Map(raw.map((p) => [p.id, p]))
for (const p of raw) {
  for (const field of ['parents', 'spouses']) {
    for (const other of p[field]) {
      if (other === p.id) fail(p.label, `lists themselves in "${field}"`)
      else if (!byId.has(other)) fail(p.label, `"${field}" mentions "${other}", but content/people/${other}.md does not exist`)
    }
  }
}

// A person must not be their own ancestor.
const state = new Map() // id -> 1 visiting, 2 done
function visit(id, trail) {
  if (state.get(id) === 2) return
  if (state.get(id) === 1) {
    const loop = [...trail.slice(trail.indexOf(id)), id].join(' -> ')
    fail(byId.get(id).label, `is their own ancestor (${loop})`)
    return
  }
  state.set(id, 1)
  for (const parent of byId.get(id).parents) if (byId.has(parent)) visit(parent, [...trail, id])
  state.set(id, 2)
}
for (const p of raw) visit(p.id, [])

// ---- photos ----------------------------------------------------------------

const produced = new Set()

async function render(src, dest, pipeline) {
  produced.add(dest)
  const [s, d] = await Promise.all([fs.stat(src), fs.stat(dest).catch(() => null)])
  if (!d || d.mtimeMs < s.mtimeMs) {
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await pipeline(sharp(src).rotate()).webp({ quality: 82 }).toFile(dest)
  }
  const meta = await sharp(dest).metadata()
  return { width: meta.width, height: meta.height }
}

const stem = (file) => path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9_-]+/g, '-')

const people = []
for (const p of raw) {
  const person = {
    id: p.id,
    name: p.name,
    born: p.born,
    died: p.died,
    birthplace: p.birthplace,
    parents: p.parents,
    spouses: p.spouses,
    thumb: null,
    portrait: null,
    gallery: [],
    bio: p.bio,
  }
  const srcOf = (file) => path.join(photosDir, p.id, file)
  const missing = (file) => fail(p.label, `photo "${file}" was not found in content/photos/${p.id}/`)
  try {
    if (p.portrait) {
      if (!(await exists(srcOf(p.portrait)))) missing(p.portrait)
      else {
        await render(srcOf(p.portrait), path.join(outPhotos, p.id, '_thumb.webp'), (img) =>
          img.resize(256, 256, { fit: 'cover', position: 'attention' }))
        await render(srcOf(p.portrait), path.join(outPhotos, p.id, '_portrait.webp'), (img) =>
          img.resize(900, 1100, { fit: 'inside', withoutEnlargement: true }))
        person.thumb = `photos/${p.id}/_thumb.webp`
        person.portrait = `photos/${p.id}/_portrait.webp`
      }
    }
    for (const g of p.gallery) {
      if (!(await exists(srcOf(g.file)))) {
        missing(g.file)
        continue
      }
      const name = `${stem(g.file)}.webp`
      const size = await render(srcOf(g.file), path.join(outPhotos, p.id, name), (img) =>
        img.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }))
      person.gallery.push({ src: `photos/${p.id}/${name}`, caption: g.caption, ...size })
    }
  } catch (e) {
    fail(p.label, `a photo could not be processed (${e.message})`)
  }
  people.push(person)
}

if (errors.length) {
  console.error(`\nThe family content has ${errors.length} problem${errors.length > 1 ? 's' : ''}:\n`)
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}

// Remove images of people or photos that no longer exist, so they are not published.
async function prune(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await prune(full)
      if ((await fs.readdir(full)).length === 0) await fs.rmdir(full)
    } else if (!produced.has(full)) await fs.rm(full)
  }
}
await prune(outPhotos)

await fs.mkdir(path.dirname(outJson), { recursive: true })
await fs.writeFile(outJson, JSON.stringify(people, null, 1) + '\n')
console.log(`content: ${people.length} people, ${produced.size} images`)
