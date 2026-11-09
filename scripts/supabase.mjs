// Shared by import-to-supabase.mjs and backup-from-supabase.mjs.
import fs from 'node:fs'

export function connect() {
  const env = { ...process.env }
  for (const file of ['.env', '.env.local']) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  // Accepts the project address with or without the "/rest/v1/" ending the dashboard shows.
  const url = env.VITE_SUPABASE_URL?.replace(/\/(rest\/v1)?\/*$/, '')
  const key = env.VITE_SUPABASE_KEY
  if (!url || !key || url.includes('your-project')) {
    console.error('Put VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env.local first (see .env.example).')
    process.exit(1)
  }
  const request = async (path, init = {}) => {
    const response = await fetch(url + path, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
    })
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`)
    return response
  }
  return { url, request }
}
