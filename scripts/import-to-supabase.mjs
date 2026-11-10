// Copies the people and photos from content/ (as built by build-content.mjs)
// into the Supabase project named in .env.local. People who already exist
// online with the same file name are replaced.
import fs from 'node:fs/promises'
import path from 'node:path'
import { connect } from './supabase.mjs'

const { request } = connect()
const people = JSON.parse(await fs.readFile('src/generated/people.json', 'utf8'))

const uploaded = new Map()
async function upload(local) {
  if (!local || /^https?:/.test(local)) return local
  if (uploaded.has(local)) return uploaded.get(local)
  // "photos/maria/_thumb.webp" on disk becomes "maria/_thumb.webp" in the photos folder online.
  const remote = local.replace(/^photos\//, '')
  await request(`/storage/v1/object/photos/${remote}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false' },
    body: await fs.readFile(path.join('public', local)),
  }).catch((e) => {
    if (!/409|already exists|Duplicate/i.test(e.message)) throw e
  })
  uploaded.set(local, remote)
  return remote
}

const rows = []
for (const p of people) {
  rows.push({
    id: p.id,
    name: p.name,
    born: p.born,
    died: p.died,
    birthplace: p.birthplace,
    parents: p.parents,
    spouses: p.spouses,
    families: p.families ?? [],
    bio: p.bio,
    thumb: await upload(p.thumb),
    portrait: await upload(p.portrait),
    gallery: await Promise.all(p.gallery.map(async (g) => ({ ...g, src: await upload(g.src) }))),
  })
}

await request('/rest/v1/people?on_conflict=id', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(rows),
})
console.log(`Imported ${rows.length} people and ${uploaded.size} photos.`)
