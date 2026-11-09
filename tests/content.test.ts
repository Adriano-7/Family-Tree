import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function build(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-content-'))
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(dir, 'content', name)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
  }
  const out = path.join(dir, 'people.json')
  const photos = path.join(dir, 'photos')
  try {
    execFileSync(process.execPath, ['scripts/build-content.mjs'], {
      env: { ...process.env, CONTENT_DIR: path.join(dir, 'content'), CONTENT_OUT_JSON: out, CONTENT_OUT_PHOTOS: photos },
      stdio: 'pipe',
    })
    return { ok: true as const, people: JSON.parse(fs.readFileSync(out, 'utf8')), photos, stderr: '' }
  } catch (e) {
    return { ok: false as const, people: [], photos, stderr: String((e as { stderr: Buffer }).stderr) }
  }
}

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="teal"/></svg>'

describe('build-content', () => {
  it('builds people, text and photos', () => {
    const r = build({
      'people/ana.md': '---\nname: Ana\nborn: 1938-04-12\ndied: 2015\nportrait: me.svg\ngallery:\n  - file: me.svg\n    caption: Hello\n---\n\nSome *text*.',
      'people/rui.md': '---\nname: Rui\nparents: [ana]\n---\n',
      'photos/ana/me.svg': svg,
    })
    expect(r.stderr).toBe('')
    const ana = r.people.find((p: { id: string }) => p.id === 'ana')
    expect(ana).toMatchObject({ name: 'Ana', born: '1938-04-12', died: '2015', thumb: 'photos/ana/_thumb.webp' })
    expect(ana.bio).toBe('Some *text*.')
    expect(ana.gallery[0]).toMatchObject({ src: 'photos/ana/me.webp', caption: 'Hello', width: 400, height: 600 })
    expect(fs.existsSync(path.join(r.photos, 'ana', '_thumb.webp'))).toBe(true)
    expect(r.people.find((p: { id: string }) => p.id === 'rui').parents).toEqual(['ana'])
  })

  it('names the file when a parent does not exist', () => {
    const r = build({ 'people/rui.md': '---\nname: Rui\nparents: [nobody]\n---\n' })
    expect(r.ok).toBe(false)
    expect(r.stderr).toMatch(/people\/rui\.md: "parents" mentions "nobody"/)
  })

  it('reports a missing photo', () => {
    const r = build({ 'people/rui.md': '---\nname: Rui\nportrait: gone.jpg\n---\n' })
    expect(r.ok).toBe(false)
    expect(r.stderr).toMatch(/photo "gone\.jpg" was not found/)
  })

  it('reports a missing name and an ancestor loop', () => {
    const r = build({
      'people/a.md': '---\nname: A\nparents: [b]\n---\n',
      'people/b.md': '---\nname: B\nparents: [a]\n---\n',
      'people/c.md': '---\nborn: 1900\n---\n',
    })
    expect(r.ok).toBe(false)
    expect(r.stderr).toMatch(/own ancestor/)
    expect(r.stderr).toMatch(/people\/c\.md: "name" is required/)
  })
})
