/**
 * 鲸晴 · MiMo 外部通路验证脚本
 * --------------------------------------------
 * 用途：在插件之外直接验证 xiaomi/mimo-v2.5 视觉 API 可用性
 * （API Key 有效、模型支持图片输入、图片编码正确）。
 *
 * 用法：
 *   node verify-mimo.mjs [图片路径] [问题]
 *
 * 说明：API Key 从 ~/.dsh/.credentials.yaml 的 XIAOMI_API_KEY 读取，
 * 也可以用环境变量 XIAOMI_API_KEY 覆盖；脚本不会把 Key 写入任何文件。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const imagePath = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample.png')
const question = process.argv[3] || '请用中文详细描述这张图片的内容。'

// ---------- 读取 API Key ----------
function readKey() {
  if (process.env.XIAOMI_API_KEY) return process.env.XIAOMI_API_KEY
  const credPath = path.join(os.homedir(), '.dsh', '.credentials.yaml')
  if (fs.existsSync(credPath)) {
    const yaml = fs.readFileSync(credPath, 'utf8')
    const m = yaml.match(/XIAOMI_API_KEY:\s*["']?([^\s"']+)/)
    if (m) return m[1]
  }
  return undefined
}
const key = readKey()
if (!key) {
  console.error('[verify] 未找到 XIAOMI_API_KEY（请检查 ~/.dsh/.credentials.yaml 或环境变量）')
  process.exit(2)
}

// ---------- 构造请求 ----------
const img = fs.readFileSync(imagePath)
const b64 = img.toString('base64')
const body = {
  model: 'mimo-v2.5',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        { type: 'text', text: question },
      ],
    },
  ],
  max_tokens: 512,
  stream: false,
}

console.log(`[verify] 图片: ${imagePath} (${img.length} bytes) -> https://api.xiaomimimo.com/v1 model=mimo-v2.5`)
const t0 = Date.now()
const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
  body: JSON.stringify(body),
})
const elapsed = Date.now() - t0
console.log(`[verify] HTTP ${res.status}，耗时 ${elapsed}ms`)
const text = await res.text()
if (!res.ok) {
  console.error(`[verify] 请求失败: ${text.slice(0, 800)}`)
  process.exit(1)
}
const data = JSON.parse(text)
const choice = data.choices && data.choices[0]
const msg = choice && choice.message
const content = (msg && (msg.content || msg.reasoning_content)) || ''
console.log('--- MiMo 返回内容 ---')
console.log(typeof content === 'string' ? content : JSON.stringify(content).slice(0, 1500))
console.log('---------------------')
console.log(`[verify] 完成：usage=${JSON.stringify(data.usage)}`)
