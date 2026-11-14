import { execFile } from 'node:child_process'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/** Rebuilds people.json and the photos whenever something in content/ changes. */
function contentPlugin(): Plugin {
  return {
    name: 'family-content',
    configureServer(server) {
      const dir = path.resolve('content')
      server.watcher.add(dir)
      let timer: ReturnType<typeof setTimeout> | undefined
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(dir + path.sep)) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          execFile(process.execPath, ['scripts/build-content.mjs'], (err, _out, stderr) => {
            if (err) server.config.logger.error(stderr || err.message)
            else server.config.logger.info('content rebuilt')
          })
        }, 150)
      })
    },
  }
}

/**
 * Adds Google Analytics to the published page when VITE_GA_ID (a "G-..." measurement ID) is
 * set. Only in builds, so working on the site locally is never counted as a visit.
 */
function analyticsPlugin(): Plugin {
  let id = ''
  return {
    name: 'google-analytics',
    apply: 'build',
    configResolved(config) {
      id = (loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_').VITE_GA_ID ?? '').trim()
      if (id && !/^G-[A-Z0-9]+$/.test(id)) {
        throw new Error(`VITE_GA_ID should look like G-XXXXXXXXXX, but is "${id}"`)
      }
    },
    transformIndexHtml() {
      if (!id) return
      return [
        {
          tag: 'script',
          attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
          injectTo: 'head',
        },
        {
          tag: 'script',
          children:
            'window.dataLayer = window.dataLayer || [];' +
            'function gtag(){dataLayer.push(arguments);}' +
            `gtag('js', new Date());gtag('config', '${id}');`,
          injectTo: 'head',
        },
      ]
    },
  }
}

export default defineConfig({
  // Served from the root of the domain: links to a side of the family (/machado) are real
  // paths, so the page's files must be found from any of them.
  base: '/',
  plugins: [react(), contentPlugin(), analyticsPlugin()],
  test: { include: ['tests/**/*.test.ts'] },
})
