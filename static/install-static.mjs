#!/usr/bin/env node
/**
 * 鲸晴 JingQing · 静态插件安装器(路线 B)
 * ============================================================
 * 运行:  node install-static.mjs [profile]
 *
 * 作用: 把鲸晴静态插件安装到指定 DSH profile(默认 web),
 *       并写入 cordis.patch.yml 启用条目。
 *       安装后 DSH 重启,插件自动加载 —— 永久生效,无需在会话中重新激活。
 *
 * 用法:
 *   node install-static.mjs           # 安装到 web profile
 *   node install-static.mjs headless  # 安装到 headless profile
 *
 * 回滚:
 *   node install-static.mjs --remove  # 移除(还原 cordis.patch.yml 备份)
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const here = import.meta.dirname
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const profile = process.argv[2] === '--remove' ? (process.argv[3] || 'web') : (process.argv[2] || 'web')
const remove = process.argv.includes('--remove')

const profileDir = path.join(home, 'profiles', profile)
const pluginsDir = path.join(profileDir, 'plugins')
const pluginFile = path.join(pluginsDir, 'jingqing-host.js')
const patchFile = path.join(profileDir, 'cordis.patch.yml')
const backupFile = patchFile + '.bak'
const sourceFile = path.join(here, 'plugins', 'jingqing-host.js')

function fail(msg) {
  console.error('✗ ' + msg)
  process.exit(1)
}

if (!fs.existsSync(profileDir)) fail(`找不到 profile: ${profileDir}`)
if (!fs.existsSync(patchFile)) fail(`找不到 cordis.patch.yml: ${patchFile}`)
if (remove) {
  // 还原备份
  if (fs.existsSync(backupFile)) {
    fs.copyFileSync(backupFile, patchFile)
    console.log('✅ 已还原 cordis.patch.yml(移除鲸晴静态插件条目)')
  } else {
    console.log('ℹ 无备份文件,请手动移除 cordis.patch.yml 中的 jingqing-static 条目')
  }
  try { fs.rmSync(pluginsDir, { recursive: true, force: true }) } catch {}
  console.log('✅ 已删除 plugins/jingqing-host.js')
  console.log('   提示:DSH 重启后静态插件完全卸载。')
  process.exit(0)
}

// 1. 复制插件文件
fs.mkdirSync(pluginsDir, { recursive: true })
if (!fs.existsSync(sourceFile)) fail(`找不到静态插件源码: ${sourceFile}`)
fs.copyFileSync(sourceFile, pluginFile)
console.log('✅ 插件已复制: ' + pluginFile)

// 2. 备份并写入 patch
if (!fs.existsSync(backupFile)) {
  fs.copyFileSync(patchFile, backupFile)
  console.log('ℹ 已备份原配置: ' + backupFile)
}

const patchEntry = `
# 鲸晴 JingQing 静态插件(路线 B):DSH 重启后自动加载,无需会话内重新激活
- insert:
    - id: jingqing-static
      name: ./plugins/jingqing-host.js
`

// 检查是否已安装(避免重复)
const existing = fs.readFileSync(patchFile, 'utf8')
if (existing.includes('jingqing-static')) {
  console.log('ℹ 鲸晴静态插件已启用(cordis.patch.yml 已有 jingqing-static 条目),无需重复安装。')
} else {
  // 完整重写:去掉孤立的 [] 占位行(块序列不能与流式空数组共存),保留头部注释 + 条目
  const lines = existing.split(/\r?\n/).filter((line) => line.trim() !== '[]' && line.trim() !== '---')
  const header = lines.join('\n').trimEnd()
  const newContent = header + '\n\n' + patchEntry.trim() + '\n'
  fs.writeFileSync(patchFile, newContent, 'utf8')
  console.log('✅ 已写入启用条目到: ' + patchFile)
}

console.log('')
console.log('┌──────────────────────────────────────────────────────┐')
console.log('│  鲸晴静态插件安装完成 ✅                              │')
console.log('│                                                      │')
console.log('│  最后一步:重启 DeepSeek Harness                       │')
console.log('│  (关闭 dsh web 进程后重新启动)                        │')
console.log('│                                                      │')
console.log('│  重启后插件自动加载,永久生效:                         │')
console.log('│  - 工具 jingqing_describe_image / jingqing_diag       │')
console.log('│  - 准入绕过(纯文本模型可上传图片)                      │')
console.log('│  - 无需在会话中重新激活                                │')
console.log('└──────────────────────────────────────────────────────┘')
