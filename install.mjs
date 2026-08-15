#!/usr/bin/env node
/**
 * 鲸晴 JingQing · 一键安装助手
 * ============================================================
 * 运行:  node install.mjs     (仓库内)
 *        npx jingqing-install (npm 包形式,发布后)
 *
 * 作用: 读取同目录下的 plugin-host.js / plugin-client.js(v1.0.0),
 *       生成一条【自包含安装消息】——包含全部源码与安装步骤,
 *       写入 INSTALL.md 并尝试复制到系统剪贴板。
 *
 * 用法: 打开 DeepSeek Harness 任意会话,直接粘贴( Ctrl+V )
 *       这条消息并按回车,AI 会自动完成 cordis_define + cordis_run,
 *       无需手动复制源码、无需了解任何 Cordis 细节。
 *
 * 依赖: 仅 Node.js 18+(含 import.meta.dirname),无任何第三方包。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

const here = import.meta.dirname
const hostPath = path.join(here, 'plugin-host.js')
const clientPath = path.join(here, 'plugin-client.js')

for (const p of [hostPath, clientPath]) {
  if (!fs.existsSync(p)) {
    console.error('✗ 缺少源码文件: ' + p)
    console.error('  请确认 install.mjs 与 plugin-host.js、plugin-client.js 在同一目录。')
    process.exit(1)
  }
}

const host = fs.readFileSync(hostPath, 'utf8')
const client = fs.readFileSync(clientPath, 'utf8')

const message = `请帮我安装【鲸晴 JingQing】插件(DeepSeek Harness 动态 Cordis 插件,让纯文本对话模型也能识别图片:图片交给视觉模型 mimo-v2.5 识别,结果交回当前模型继续推理)。

请严格按以下步骤执行:

第一步:调用 cordis_define 工具,参数如下——
- plugin: {"kind": "new", "idPrefix": "jingq"}
- name: "鲸晴 JingQing v1.0.0"
- purpose: "让不支持识图的对话模型(如 DeepSeek)通过视觉模型(mimo-v2.5)自动识图后继续推理:绕过图片准入检查、注入识图指令、提供可展开的工具调用卡片"
- code: 必须【在同一次调用中同时】提供 host 和 client 两个字段(不要拆成两次 define):
  - code.host 的值 = 下面 [HOST 源码] 代码块中的完整内容(逐字复制,不要省略、不要修改)
  - code.client 的值 = 下面 [CLIENT 源码] 代码块中的完整内容(逐字复制,不要省略、不要修改)

第二步:定义成功后,调用 cordis_run 工具激活——
- pluginId: 使用 cordis_define 返回的 pluginId
- packageId: 使用 cordis_define 返回的 packageId
- mode: "run"

第三步:激活完成后,简要告诉我结果(工具是否注册、设置页入口是否恢复)。

注意:如果激活后需要在浏览器显示设置面板,请提醒我 Client 半区可能需要用户在浏览器中批准。

========== [HOST 源码] 开始 ==========
${host}
========== [HOST 源码] 结束 ==========

========== [CLIENT 源码] 开始 ==========
${client}
========== [CLIENT 源码] 结束 ==========
`

/* ---------- 写入 INSTALL.md(全局安装时包目录可能只读,回退到用户目录) ---------- */
let outPath = path.join(here, 'INSTALL.md')
try {
  fs.writeFileSync(outPath, message, 'utf8')
} catch {
  outPath = path.join(os.homedir(), 'jingqing-INSTALL.md')
  fs.writeFileSync(outPath, message, 'utf8')
}

/* ---------- 复制到剪贴板(尽力而为) ---------- */
let copied = false
try {
  const platform = os.platform()
  if (platform === 'win32') {
    // 命令行参数有 ~32K 长度限制,超大文本走临时文件 + Get-Content 管道
    const tmp = path.join(os.tmpdir(), 'jingqing-install-' + process.pid + '.txt')
    // 写 UTF-8 BOM,避免 Windows PowerShell 5 按 ANSI 误读中文
    fs.writeFileSync(tmp, '\uFEFF' + message, 'utf8')
    try {
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Get-Content -LiteralPath '${tmp}' -Raw -Encoding UTF8 | Set-Clipboard`,
      ], { stdio: 'ignore' })
      copied = true
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* 忽略清理失败 */ }
    }
  } else if (platform === 'darwin') {
    execFileSync('pbcopy', [], { input: message, stdio: 'ignore' })
    copied = true
  } else if (platform === 'linux') {
    try {
      execFileSync('xclip', ['-selection', 'clipboard'], { input: message, stdio: 'ignore' })
    } catch {
      execFileSync('xsel', ['--clipboard', '--input'], { input: message, stdio: 'ignore' })
    }
    copied = true
  }
} catch {
  copied = false
}

/* ---------- 输出指引 ---------- */
console.log('')
console.log('✅ 鲸晴 v1.0.0 安装消息已生成')
console.log('   ─────────────────────────────────────────────')
console.log('   安装消息文件: ' + outPath)
console.log('   剪贴板状态:  ' + (copied ? '已复制 ✅' : '复制失败,请手动打开 INSTALL.md 全选复制'))
console.log('   ─────────────────────────────────────────────')
console.log('   下一步(2 步即可完成安装):')
console.log('   1. 打开 DeepSeek Harness 任意会话')
console.log('   2. 直接粘贴(Ctrl+V)并按回车 → AI 自动完成定义与激活')
console.log('')
console.log('   提示:安装后建议顺便上传一张图片测试识图是否生效。')
