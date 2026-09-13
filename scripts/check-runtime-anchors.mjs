/**
 * 运行时锚点契约检查。
 *
 * 用法：node scripts/check-runtime-anchors.mjs <运行时目录> [更多目录...]
 *
 * 扫描目标目录里 @deepseek-ai 命名空间下的客户端插件产物（.js），
 * 校验 android.css 依赖的运行时锚点（data-* 属性、CSS 变量）是否仍然存在。
 * 官方升级 dsh 或客户端插件后，在构建镜像 / CI 阶段运行本脚本：
 * 锚点缺失立即失败，并列出会静默失效的适配规则与处理方式。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { RUNTIME_ANCHORS, findMissingAnchors, missingAnchorsMessage } from './anchor-contract.mjs'

const roots = process.argv.slice(2)
if (roots.length === 0) {
  console.error('用法：node scripts/check-runtime-anchors.mjs <运行时目录> [更多目录...]')
  process.exit(2)
}

let corpus = ''
for (const root of roots) {
  const absolute = resolve(root)
  const chunks = []
  for (const entry of await readdir(absolute, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const fullPath = join(entry.parentPath, entry.name).replaceAll('\\', '/')
    // 只读 @deepseek-ai 命名空间下的插件产物；其余文件与锚点无关。
    if (!fullPath.includes('/@deepseek-ai/')) continue
    chunks.push(await readFile(join(entry.parentPath, entry.name), 'utf8'))
  }
  console.log(`已扫描 ${absolute}：${chunks.length} 个插件产物文件`)
  corpus += `${chunks.join('\n')}\n`
}

const missing = findMissingAnchors(RUNTIME_ANCHORS, corpus)
if (missing.length > 0) {
  console.error(missingAnchorsMessage('运行时插件产物', missing))
  process.exit(1)
}
console.log(`运行时锚点契约完整：${RUNTIME_ANCHORS.length} 项全部存在`)
