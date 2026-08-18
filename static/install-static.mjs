#!/usr/bin/env node
/**
 * 鲸晴 JingQing · 静态插件安装器(路线 B,标准包格式)
 * ============================================================
 * 运行:  npx -y -p jingqing jingqing-static   (npm 包形式,推荐,无需克隆仓库)
 *        node install-static.mjs [profile] (仓库内)
 *
 * 作用: 把鲸晴静态插件包(含 Host + Client 双半区)复制到
 *       <DSH_HOME>/profiles/node_modules/jingqing,并在 web profile 的
 *       cordis.patch.yml 写入静态挂载条目。
 *       重启后:Host 半区自动加载(工具+准入绕过+HTTP API),
 *       Client 半区由 dsh-client-modules 自动发现 —— 面板永久存在。
 *       (与 dsh-usage-stats 的 npx 安装完全同机制)
 *
 * 用法:
 *   npx -y -p jingqing jingqing-static # 一键安装到 web profile(推荐)
 *   node install-static.mjs headless   # 安装到 headless profile
 *   node install-static.mjs --remove   # 移除(还原 cordis.patch.yml 备份)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`鲸晴 JingQing 静态插件安装器(永久生效,含面板)
用法:
  npx -y -p jingqing jingqing-static   # 安装到 web profile(推荐)
  node install-static.mjs [profile]    # 仓库内运行,默认 web
  node install-static.mjs --remove     # 移除(还原备份)
安装后重启 DeepSeek Harness,插件与设置面板自动加载。`)
  process.exit(0)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const profile = process.argv[2] === '--remove' ? (process.argv[3] || 'web') : (process.argv[2] || 'web')
const remove = process.argv.includes('--remove')

// J7 加固:profile 参数直接拼入路径,拒绝路径分隔符与跳级(本地自用,防手误/防注入)
if (/[\\/]|\.\./.test(profile)) fail('profile 参数不合法(不允许路径分隔符或 ..): ' + profile)

const profilesNodeModules = path.join(home, 'profiles', 'node_modules')
const pkgDir = path.join(profilesNodeModules, 'jingqing')
const patchFile = path.join(home, 'profiles', profile, 'cordis.patch.yml')
const backupFile = patchFile + '.bak'
const sourceDir = path.join(here, 'jingqing') // static/jingqing 包目录

function fail(msg) {
  console.error('✗ ' + msg)
  process.exit(1)
}

if (remove) {
  if (fs.existsSync(backupFile)) {
    fs.copyFileSync(backupFile, patchFile)
    console.log('✅ 已还原 cordis.patch.yml(移除鲸晴静态插件条目)')
  } else {
    console.log('ℹ 无备份文件,请手动移除 cordis.patch.yml 中的 jingqing 条目')
  }
  try { fs.rmSync(pkgDir, { recursive: true, force: true }) } catch {}
  console.log('✅ 已删除 ' + pkgDir)
  console.log('   提示:DSH 重启后静态插件(含面板)完全卸载。')
  process.exit(0)
}

// 1. 校验源码包
if (!fs.existsSync(path.join(sourceDir, 'package.json'))) fail(`找不到静态插件包: ${sourceDir}`)
if (!fs.existsSync(path.join(sourceDir, 'lib', 'index.js'))) fail(`缺少 Host 半区: ${path.join(sourceDir, 'lib', 'index.js')}`)
if (!fs.existsSync(path.join(sourceDir, 'lib', 'client.js'))) fail(`缺少 Client 半区: ${path.join(sourceDir, 'lib', 'client.js')}`)

// 2. 复制整个包到 profiles/node_modules/jingqing
fs.rmSync(pkgDir, { recursive: true, force: true })
fs.cpSync(sourceDir, pkgDir, { recursive: true })
console.log('✅ 插件包已复制: ' + pkgDir)

// 3. 备份并写入 patch(web profile)
const patchDir = path.dirname(patchFile)
fs.mkdirSync(patchDir, { recursive: true })
// 仅当已存在原配置时才备份(全新环境无 cordis.patch.yml,直接创建即可)
if (fs.existsSync(patchFile) && !fs.existsSync(backupFile)) {
  fs.copyFileSync(patchFile, backupFile)
  console.log('ℹ 已备份原配置: ' + backupFile)
}

const entryLine = /^\s+name:\s*jingqing\s*$/gm
const patchEntry = `
# 鲸晴 JingQing 静态插件(路线 B):DSH 重启后自动加载,含设置面板
- insert:
    - id: jingqing
      name: jingqing
`

// 4. 写入启用条目(处理 [] 占位冲突,与 dsh-usage-stats 同逻辑)
function meaningfulLines(text) {
  return String(text).split(/\r?\n/).map((line, index) => ({
    index,
    indent: line.match(/^[ \t]*/)?.[0].length ?? 0,
    content: line.trim(),
  })).filter(({ content }) => content !== '' && !content.startsWith('#') && content !== '---' && content !== '...')
}
function withoutEmptySequenceRoot(text) {
  const meaningful = meaningfulLines(text)
  if (meaningful.length === 0) return text
  const rootIndent = Math.min(...meaningful.map(({ indent }) => indent))
  const emptyRoot = meaningful.find(({ indent, content }) => indent === rootIndent && /^\[\](?:[ \t]+#.*)?$/.test(content))
  if (emptyRoot === undefined) return text
  const lines = String(text).split(/\r?\n/)
  lines.splice(emptyRoot.index, 1)
  return lines.filter((line) => line.trim() !== '...').join('\n').trimEnd()
}
function enablePluginInPatch(text) {
  const base = withoutEmptySequenceRoot(text)
  if ([...base.matchAll(entryLine)].length > 0) return base
  return base.trim() === '' ? patchEntry : `${base.trimEnd()}\n\n${patchEntry}`
}

const current = fs.existsSync(patchFile) ? fs.readFileSync(patchFile, 'utf8') : ''
const enabledPatch = enablePluginInPatch(current)
if (enabledPatch !== current) fs.writeFileSync(patchFile, enabledPatch, 'utf8')

console.log('')
console.log('┌──────────────────────────────────────────────────────┐')
console.log('│  鲸晴静态插件安装完成 ✅(含设置面板)                 │')
console.log('│                                                      │')
console.log('│  最后一步:重启 DeepSeek Harness                       │')
console.log('│  (关闭 dsh web 进程后重新启动)                        │')
console.log('│                                                      │')
console.log('│  重启后自动加载,永久生效:                             │')
console.log('│  - 工具 jingqing_describe_image / jingqing_diag       │')
console.log('│  - 准入绕过(纯文本模型可上传图片)                      │')
console.log('│  - 设置面板(设置 → 鲸晴)                              │')
console.log('│  - 无需在会话中重新激活                                │')
console.log('└──────────────────────────────────────────────────────┘')
