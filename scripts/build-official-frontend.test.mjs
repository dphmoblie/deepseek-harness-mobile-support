import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, 'node_modules/@deepseek-ai/dsh-web-frontend/dist')
const outputRoot = resolve(projectRoot, 'dist')

test('built Android frontend preserves every official resource and has one entrypoint', async () => {
  await promisify(execFile)(process.execPath, ['scripts/build-official-frontend.mjs'], { cwd: projectRoot })
  const officialFiles = await readdir(sourceRoot, { recursive: true, withFileTypes: true })
  for (const entry of officialFiles.filter(entry => entry.isFile())) {
    const sourcePath = resolve(entry.parentPath, entry.name)
    const targetPath = sourcePath.replace(sourceRoot, outputRoot)
    if (entry.name === 'index.html') continue
    assert.deepEqual(await readFile(targetPath), await readFile(sourcePath), sourcePath)
  }
  const index = await readFile(resolve(outputRoot, 'index.html'), 'utf8')
  const original = await readFile(resolve(sourceRoot, 'index.html'), 'utf8')
  const scripts = html => [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gu)].map(match => match[1])
  assert.deepEqual(scripts(index), scripts(original), 'must use the original app entrypoint')
  assert.match(index, /name="dsh-official-frontend" content="android-adapted-v1"/)
  assert.match(index, /viewport-fit=cover/)
  assert.equal(index.match(/href="\/dsh-android.css"/gu)?.length, 1)
  assert.doesNotMatch(index, /dsh-mobile-frontend|plugin-workbench|\/src\//u)
  const outputFiles = await readdir(outputRoot, { recursive: true, withFileTypes: true })
  assert.equal(outputFiles.filter(entry => entry.isFile()).length,
    officialFiles.filter(entry => entry.isFile()).length + 1, 'only the adaptation CSS is added')
  assert.deepEqual(await readFile(resolve(outputRoot, 'dsh-android.css')),
    await readFile(resolve(projectRoot, 'android.css')))
})

test('Android adaptation stylesheet covers safe areas and mobile interaction constraints', async () => {
  const css = await readFile(resolve(projectRoot, 'android.css'), 'utf8')
  assert.match(css, /safe-area-inset-(top|right|bottom|left)/u)
  assert.match(css, /100dvh/u)
  assert.match(css, /\.md-code-block[\s\S]*overflow-x:\s*auto/u)
  assert.match(css, /prefers-reduced-motion/u)
  // Tap targets grow through a pseudo-element: a 44px `min-height` would beat
  // the official 16-28px fixed `height` and burst the dense icon rows.
  assert.match(css, /::after[\s\S]*max\(100%,\s*44px\)/u)
  assert.doesNotMatch(css, /min-height:\s*44px/u)
  // Anti-zoom needs !important: the official controls are styled through
  // CSS-Modules hash classes, which outrank a bare element selector.
  assert.match(css, /font-size:\s*max\(16px,\s*1em\)\s*!important/u)
})

test('every !important stays inside a narrow-viewport or coarse-pointer query', async () => {
  // Comments discuss `!important` and braces; strip them before walking.
  const css = (await readFile(resolve(projectRoot, 'android.css'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//gu, '')
  // Desktop and tablet must keep the official metrics untouched, so no
  // forced declaration may sit at the top level. Walks brace depth and
  // records the query each `!important` is nested under.
  const queries = []
  let depth = 0
  let atRule = null
  for (const token of css.split(/(@media[^{]*|[{}]|!important)/u)) {
    if (token.startsWith('@media')) atRule = token.trim()
    else if (token === '{') depth += 1
    else if (token === '}') { depth -= 1; if (depth === 0) atRule = null }
    else if (token === '!important') queries.push(atRule)
  }
  assert.ok(queries.length > 0, 'the anti-zoom and layout overrides are expected')
  for (const query of queries) {
    assert.ok(
      query !== null && /max-width:\s*720px|pointer:\s*coarse|prefers-reduced-motion/u.test(query),
      `!important outside a narrow-viewport guard: ${String(query)}`,
    )
  }
})

test('the sidebar drawer keeps the rail reachable and degrades without :has()', async () => {
  const css = await readFile(resolve(projectRoot, 'android.css'), 'utf8')
  // The frame has no stable class name, so it is matched structurally.
  assert.match(css, /:has\(>\s*\[data-shell-overlay\]\):has\(>\s*\[data-rightbar-col\]\)/u)
  // The 56px rail carries the only control that reopens the sidebar; hiding
  // the sidebar column outright would trap the user in the transcript.
  assert.doesNotMatch(css, /\[data-shell-overlay\]\)[^{]*>\s*:first-child\s*\{[^}]*display:\s*none/u)
  // Pointer-only drag handles are the ones that go.
  assert.match(css, /\[data-width-handle\][\s\S]*display:\s*none\s*!important/u)
})
