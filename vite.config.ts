import { execFile } from 'node:child_process'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
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

export default defineConfig({
  base: './',
  plugins: [react(), contentPlugin()],
  test: { include: ['tests/**/*.test.ts'] },
})
