import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(resolve(projectRoot, 'dsh-mobile-session.js'), 'utf8')

/** 构造脚本需要的最小浏览器环境；cookie 与 localStorage 都留在断言可见的闭包里。 */
function sandbox({ hash = '', stored = null, withoutResolvers = false, beforeRun = null } = {}) {
  const items = new Map()
  if (stored !== null) items.set('dsh.sessions.current', stored)
  let cookie = ''
  const replaced = []
  class Storage {}
  Storage.prototype.getItem = function getItem (key) {
    return items.has(key) ? items.get(key) : null
  }
  Storage.prototype.setItem = function setItem (key, value) {
    items.set(key, String(value))
  }
  const localStorage = Object.create(Storage.prototype)
  const document = {
    get cookie () {
      return cookie
    },
    set cookie (value) {
      cookie = String(value)
    },
  }
  const location = {
    hash,
    pathname: '/',
    search: '?token=abc',
    replace (value) {
      replaced.push(value)
    },
  }
  const context = vm.createContext({ Storage, document, localStorage, location })
  if (withoutResolvers) {
    // 模拟荣耀浏览器 3.6.1（Chromium 116）等缺少该静态方法的内核。
    assert.equal(vm.runInContext('typeof Promise.withResolvers', context), 'function')
    vm.runInContext('delete Promise.withResolvers', context)
    assert.equal(vm.runInContext('typeof Promise.withResolvers', context), 'undefined')
  }
  beforeRun?.(context)
  vm.runInContext(source, context)
  return {
    cookie: () => cookie,
    context,
    items,
    localStorage,
    promise: vm.runInContext('Promise', context),
    replaced,
  }
}

test('fragment seeds DSH storage before the app boots, then strips the fragment', () => {
  const page = sandbox({ hash: '#dshMobileSession=session-49c96fce-f065-4c1d-b1af-6c339631657a' })
  assert.equal(page.items.get('dsh.sessions.current'),
    '{"sessionId":"session-49c96fce-f065-4c1d-b1af-6c339631657a"}')
  assert.deepEqual(page.replaced, ['/?token=abc'])
  // 第一份文档只负责写入并跳转；Cookie 由重新加载后的那一份镜像。
  assert.equal(page.cookie(), '')
})

test('invalid or missing fragment never overrides the stored selection', () => {
  for (const hash of ['', '#dshMobileSession=', '#dshMobileSession=not-a-session',
    '#dshMobileSession=session-', '#dshMobileSession=session-ok%00']) {
    const page = sandbox({ hash, stored: '{"sessionId":"session-df626b7d-64c9-4c09-a467-b0fde3f1f86e"}' })
    assert.equal(page.items.get('dsh.sessions.current'),
      '{"sessionId":"session-df626b7d-64c9-4c09-a467-b0fde3f1f86e"}', hash)
    assert.deepEqual(page.replaced, [], hash)
  }
  // 片段里可以带别的参数，但只认校验通过的会话键。
  const valid = sandbox({ hash: '#dshMobileSession=session-abc&from=app' })
  assert.equal(valid.items.get('dsh.sessions.current'), '{"sessionId":"session-abc"}')
})

test('current session is mirrored to the cookie and follows later switches', () => {
  const page = sandbox({ stored: '{"sessionId":"session-df626b7d-64c9-4c09-a467-b0fde3f1f86e"}' })
  assert.equal(page.cookie(), 'dsh_mobile_last_session=session-df626b7d-64c9-4c09-a467-b0fde3f1f86e; Path=/; SameSite=Lax; Max-Age=31536000')
  // 官方存储通过 localStorage.setItem 写入；补丁必须让镜像跟上切换。
  page.localStorage.setItem('dsh.sessions.current', '{"sessionId":"session-9630e109-b256-46e9-9ea3-45a27fef9e4d"}')
  assert.equal(page.cookie(), 'dsh_mobile_last_session=session-9630e109-b256-46e9-9ea3-45a27fef9e4d; Path=/; SameSite=Lax; Max-Age=31536000')
  // 清空选择（{}）保留最后一次有效会话，供下一次外置打开兜底。
  page.localStorage.setItem('dsh.sessions.current', '{}')
  assert.match(page.cookie(), /session-9630e109/)
})

test('old external browsers get Promise.withResolvers before DSH boots', async () => {
  const page = sandbox({
    hash: '#dshMobileSession=session-49c96fce-f065-4c1d-b1af-6c339631657a',
    withoutResolvers: true,
  })
  assert.equal(typeof page.promise.withResolvers, 'function')
  const resolved = page.promise.withResolvers()
  assert.ok(resolved.promise instanceof page.promise)
  resolved.resolve('done')
  assert.equal(await resolved.promise, 'done')
  const rejected = page.promise.withResolvers()
  rejected.reject(new Error('expected'))
  await assert.rejects(rejected.promise, /expected/u)
  // 补丁先于会话写入执行：会话续接不受旧内核影响。
  assert.equal(page.items.get('dsh.sessions.current'),
    '{"sessionId":"session-49c96fce-f065-4c1d-b1af-6c339631657a"}')
})

test('native Promise.withResolvers is left untouched', () => {
  const sentinel = function nativeWithResolvers () {}
  const page = sandbox({
    beforeRun: context => {
      context.__sentinel = sentinel
      vm.runInContext('Promise.withResolvers = __sentinel', context)
    },
  })
  assert.equal(page.promise.withResolvers, sentinel)
})
