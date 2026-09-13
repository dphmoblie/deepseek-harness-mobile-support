import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { RUNTIME_ANCHORS, STATIC_ANCHORS, findMissingAnchors } from './anchor-contract.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const frontendRoot = resolve(projectRoot, 'node_modules/@deepseek-ai/dsh-web-frontend/dist')

test('findMissingAnchors reports only the anchors absent from the corpus', () => {
  const anchors = [
    { token: 'present-token', purpose: '示例：存在的锚点' },
    { token: 'absent-token', purpose: '示例：缺失的锚点' },
  ]
  assert.deepEqual(findMissingAnchors(anchors, 'a string with present-token inside'), [anchors[1]])
  assert.deepEqual(findMissingAnchors(anchors, 'present-token and absent-token'), [])
})

test('the runtime anchor guard fails and names the affected rules when anchors disappear', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-anchor-fail-'))
  try {
    const plugin = join(root, 'node_modules/@deepseek-ai/dsh-client-ui-layout/lib')
    await mkdir(plugin, { recursive: true })
    await writeFile(join(plugin, 'client.js'), 'const empty = "no anchors here";\n', 'utf8')
    const result = await promisify(execFile)(process.execPath, ['scripts/check-runtime-anchors.mjs', root], {
      cwd: projectRoot,
    }).then(() => null, error => error)
    assert.ok(result, '缺少锚点的运行时目录必须让检查失败')
    assert.equal(result.code, 1)
    for (const anchor of RUNTIME_ANCHORS) {
      assert.match(result.stderr, new RegExp(anchor.token.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&')))
    }
    assert.match(result.stderr, /android\.css/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the runtime anchor guard passes when the plugin tree carries every anchor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-anchor-pass-'))
  try {
    const plugin = join(root, 'node_modules/@deepseek-ai/dsh-client-ui-layout/lib')
    await mkdir(plugin, { recursive: true })
    const body = RUNTIME_ANCHORS.map(anchor => `"${anchor.token}"`).join(', ')
    await writeFile(join(plugin, 'client.js'), `const anchors = [${body}];\n`, 'utf8')
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/check-runtime-anchors.mjs', root], {
      cwd: projectRoot,
    })
    assert.match(stdout, /运行时锚点契约完整/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the installed official frontend still carries every static anchor', async () => {
  const chunks = []
  for (const entry of await readdir(frontendRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:css|js)$/u.test(entry.name)) continue
    chunks.push(await readFile(resolve(entry.parentPath, entry.name), 'utf8'))
  }
  assert.deepEqual(findMissingAnchors(STATIC_ANCHORS, chunks.join('\n')), [])
})
