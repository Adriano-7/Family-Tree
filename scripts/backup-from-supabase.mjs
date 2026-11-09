// Saves everybody in the online family tree to backups/people-<date>.json.
import fs from 'node:fs/promises'
import { connect } from './supabase.mjs'

const { request } = connect()
const people = await (await request('/rest/v1/people?select=*&order=id')).json()
const file = `backups/people-${new Date().toISOString().slice(0, 10)}.json`
await fs.mkdir('backups', { recursive: true })
await fs.writeFile(file, JSON.stringify(people, null, 1) + '\n')
console.log(`Saved ${people.length} people to ${file}`)
