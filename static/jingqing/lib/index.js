/**
 * 鲸晴 JingQing · 静态 Host 插件(v1.0.0-static-p1)
 * ============================================================
 * 路线 B:静态 Cordis 插件,通过 profile 的 cordis.patch.yml 挂载,
 * DSH 重启后自动加载 —— 无需每次在会话中重新激活。
 *
 * 与动态版(v1.0.0)的区别:
 * - 无 node:vm 沙箱,直接 import(defineTool from '@deepseek-ai/dsh-tools')
 * - 工具注册用 ctx.tools.register()(与动态 harness.defineTool 同源 DSL)
 * - 无全局 harness;RPC(jingqing/panel/*)仅动态 Client 需要,静态版省略
 * - 完整 Node 环境可用(AbortController 等),但保持与动态版相同的
 *   exec.signal 透传 + 循环耗时检查逻辑,便于两者行为一致
 *
 * 挂载方式(profile 层,例如 web):
 *   cordis.patch.yml 增加:
 *   - id: jingqing-static
 *     name: ./plugins/jingqing-host
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

const name = "jingqing"

const inject = ["timer", "tools", "llm", "settings", "credentials", "attachments"]

function apply(ctx) {
    /* ==================== [0] 配置 ==================== */
    const PLUGIN_LABEL = '鲸晴'
    const TOOL_NAME = 'jingqing_describe_image'
    const DIAG_TOOL_NAME = 'jingqing_diag'
    const VERSION = 'v1.0.0-static-p1'
    const RECOMMENDED_VISION_ROUTES = [
      { provider: 'xiaomi', model: 'mimo-v2.5' },
      { provider: 'opencode-go', model: 'mimo-v2.5' },
    ]
    // 内置成本表(美元/百万 token),来源:pi-ai 模型目录 cost 字段(2026-08 快照)
    const MODEL_COST_TABLE = {
      'xiaomi|mimo-v2.5': { input: 0.14, output: 0.28 },
      'opencode-go|mimo-v2.5': { input: 0.14, output: 0.28 },
      'xiaomi|mimo-v2-omni': { input: 0.14, output: 0.28 },
      'opencode-go|minimax-m3': { input: 0.30, output: 1.20 },
      'opencode-go|qwen3.7-plus': { input: 0.40, output: 1.60 },
      'opencode-go|kimi-k2.6': { input: 0.95, output: 4.00 },
      'opencode-go|kimi-k2.7-code': { input: 0.95, output: 4.00 },
      'opencode-go|kimi-k3': { input: 3.00, output: 15.00 },
      'opencode-go|qwen3.6-plus': { input: 0.50, output: 3.00 },
      'opencode-go|grok-4.5': { input: 2.00, output: 6.00 },
    }
    const DEFAULT_CONFIG = {
      enabled: true,
      routesEnabled: {},
      routeOrder: [],
      timeoutMs: 20000,
      maxTokens: 512,
      temperature: 0.2,
    }
    const CONFIG_RANGES = {
      timeoutMs: { min: 1000, max: 60000, step: 1 },
      maxTokens: { min: 64, max: 4096, step: 1 },
      temperature: { min: 0, max: 2, step: 0.05 },
    }
    const LOG_LIMIT = 300

    /* ==================== [1] 日志缓冲 ==================== */
    const logBuffer = []
    function safeJson(v) {
      try { return JSON.stringify(v) } catch (e) { return String(v) }
    }
    function log(level, event, detail) {
      const entry = {
        t: new Date().toISOString(),
        level,
        event,
        detail: detail === undefined ? null : (typeof detail === 'string' ? detail : safeJson(detail)),
      }
      logBuffer.push(entry)
      if (logBuffer.length > LOG_LIMIT) logBuffer.shift()
      if (level === 'error') console.error(`[鲸晴] ${event}`, detail)
      else console.log(`[鲸晴] ${event}`, detail)
    }

    const llm = ctx.get('llm')
    const settingsSvc = ctx.get('settings')
    const credentialsSvc = ctx.get('credentials')

    /* ==================== [2] PanelConfig(内存配置,即时生效) ==================== */
    let config = { ...DEFAULT_CONFIG, routesEnabled: {} }
    function routeKeyOf(provider, model) {
      return String(provider) + '|' + String(model)
    }
    function knownRouteKeys() {
      const keys = new Set()
      for (const v of scanResult.visionModels) keys.add(routeKeyOf(v.provider, v.id))
      return keys
    }
    function ensureRouteKeys() {
      for (const key of knownRouteKeys()) {
        if (config.routesEnabled[key] === undefined) config.routesEnabled[key] = true
      }
    }
    function isRouteEnabled(provider, model) {
      return config.routesEnabled[routeKeyOf(provider, model)] !== false
    }
    function applyConfigPatch(patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return { ok: false, error: '补丁必须为对象' }
      }
      const allowed = new Set(['enabled', 'routesEnabled', 'routeOrder', 'timeoutMs', 'maxTokens', 'temperature'])
      const keys = Object.keys(patch)
      if (keys.length === 0) return { ok: false, error: '补丁为空' }
      for (const key of keys) {
        if (!allowed.has(key)) return { ok: false, error: '未知字段: ' + key }
      }
      const next = { ...config, routesEnabled: { ...config.routesEnabled } }
      if (patch.enabled !== undefined) {
        if (typeof patch.enabled !== 'boolean') return { ok: false, error: 'enabled 必须为布尔值' }
        next.enabled = patch.enabled
      }
      if (patch.routesEnabled !== undefined) {
        if (!patch.routesEnabled || typeof patch.routesEnabled !== 'object' || Array.isArray(patch.routesEnabled)) {
          return { ok: false, error: 'routesEnabled 必须为对象' }
        }
        for (const [key, value] of Object.entries(patch.routesEnabled)) {
          if (typeof key !== 'string' || key.length === 0) return { ok: false, error: 'routesEnabled 键非法' }
          if (typeof value !== 'boolean') return { ok: false, error: 'routesEnabled[' + key + '] 必须为布尔值' }
        }
        for (const [key, value] of Object.entries(patch.routesEnabled)) next.routesEnabled[key] = value
      }
      if (patch.routeOrder !== undefined) {
        if (!Array.isArray(patch.routeOrder)) return { ok: false, error: 'routeOrder 必须为数组' }
        const seen = new Set()
        const clean = []
        for (const item of patch.routeOrder) {
          if (typeof item !== 'string' || item.length === 0) {
            return { ok: false, error: 'routeOrder 元素必须为非空字符串' }
          }
          if (!seen.has(item)) { seen.add(item); clean.push(item) }
        }
        next.routeOrder = clean
      }
      for (const field of ['timeoutMs', 'maxTokens', 'temperature']) {
        if (patch[field] === undefined) continue
        const range = CONFIG_RANGES[field]
        const value = patch[field]
        if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: field + ' 必须为数值' }
        if (value < range.min || value > range.max) {
          return { ok: false, error: field + ' 超出范围 ' + range.min + '–' + range.max }
        }
        if (range.step === 1) {
          if (!Number.isInteger(value)) return { ok: false, error: field + ' 必须为整数' }
          next[field] = value
        } else {
          next[field] = Math.round(value / range.step) * range.step
        }
      }
      config = next
      return { ok: true, config }
    }

    /* ==================== [3] 模型扫描 ==================== */
    let scanResult = {
      ready: false, providers: [], visionModels: [],
      missingCredentials: [], errors: [], scannedAt: null,
    }
    let scanning = false
    let scanPromise = null

    // 性价比评分:输入价×0.5 + 输出价×0.5(越小越优)
    function scoreOf(provider, model) {
      const cost = MODEL_COST_TABLE[routeKeyOf(provider, model)]
      if (!cost) return Number.POSITIVE_INFINITY
      return cost.input * 0.5 + cost.output * 0.5
    }
    function providerPref(provider) {
      const i = RECOMMENDED_VISION_ROUTES.findIndex((r) => r.provider === provider)
      return i === -1 ? 99 : i
    }
    function modelPref(provider, model) {
      const i = RECOMMENDED_VISION_ROUTES.findIndex((r) => r.provider === provider && r.model === model)
      return i === -1 ? 99 : i
    }
    function sortedVisionModels() {
      const list = scanResult.visionModels.slice()
      list.sort((a, b) => {
        const sa = scoreOf(a.provider, a.id)
        const sb = scoreOf(b.provider, b.id)
        if (sa !== sb) return sa - sb
        const pa = providerPref(a.provider)
        const pb = providerPref(b.provider)
        if (pa !== pb) return pa - pb
        const ma = modelPref(a.provider, a.id)
        const mb = modelPref(b.provider, b.id)
        if (ma !== mb) return ma - mb
        return String(a.id).localeCompare(String(b.id))
      })
      return list
    }

    async function probeCredentials() {
      const out = []
      if (!settingsSvc || !credentialsSvc) return out
      try {
        const raw = settingsSvc.get('llm-pi-ai')
        const providers = raw && typeof raw === 'object' && raw.providers ? raw.providers : {}
        for (const provider of Object.keys(providers)) {
          const profile = providers[provider]
          const env = profile && typeof profile === 'object' ? profile.apiKeyEnv : undefined
          if (typeof env !== 'string' || env.length === 0) continue
          try {
            const info = await credentialsSvc.describe(env)
            out.push({ provider, apiKeyEnv: env, configured: Boolean(info && info.configured) })
          } catch (e) {
            out.push({ provider, apiKeyEnv: env, configured: false, probeError: String(e) })
          }
        }
      } catch (e) {
        log('warn', 'credential-probe', String(e))
      }
      return out
    }

    function credentialOf(provider) {
      const hit = scanResult.missingCredentials.find((c) => c.provider === provider)
      return hit ? { apiKeyEnv: hit.apiKeyEnv, configured: Boolean(hit.configured) } : { configured: null }
    }

    // 扫描策略:仅 apply 首次与手动 rescan 触发
    async function scan() {
      if (scanning) return scanPromise
      scanning = true
      scanPromise = (async () => {
        const startedAt = Date.now()
        const result = {
          ready: false, providers: [], visionModels: [],
          missingCredentials: [], errors: [], scannedAt: null,
        }
        try {
          if (!llm || typeof llm.listProviders !== 'function') throw new Error('llm 服务不可用')
          try {
            result.providers = llm.listProviders().map((p) => (p && typeof p.id === 'string' ? p.id : String(p))).filter(Boolean)
          } catch (e) {
            result.errors.push('listProviders: ' + String(e))
          }
          const vision = []
          for (const provider of result.providers) {
            try {
              const models = await llm.listModels(provider)
              for (const m of models || []) {
                const mods = m && m.inputModalities
                if (Array.isArray(mods) && mods.includes('image')) {
                  const cost = MODEL_COST_TABLE[routeKeyOf(provider, m.id)] || null
                  vision.push({
                    provider,
                    id: m.id,
                    name: m.name || m.id,
                    cost,
                    score: cost ? cost.input * 0.5 + cost.output * 0.5 : null,
                  })
                }
              }
            } catch (e) {
              result.errors.push(provider + ': ' + String(e))
            }
          }
          result.visionModels = vision
          result.missingCredentials = await probeCredentials()
          result.ready = true
          result.scannedAt = Date.now()
          ensureRouteKeys()
          log('info', 'scan', {
            providers: result.providers.length,
            visionModels: result.visionModels.length,
            recommended: recommendedOf().map((r) => r.provider + '/' + r.model),
            ms: Date.now() - startedAt,
          })
        } catch (e) {
          result.errors.push(String(e))
          log('error', 'scan', String(e))
        }
        scanResult = result
        scanning = false
        return result
      })()
      return scanPromise
    }

    /* ==================== [4] 路由决策 ==================== */
    function recommendedOf() {
      if (!scanResult.ready) {
        return RECOMMENDED_VISION_ROUTES.filter((r) => isRouteEnabled(r.provider, r.model))
      }
      const sorted = sortedVisionModels().filter((v) => isRouteEnabled(v.provider, v.id))
      return sorted.length > 0 ? [sorted[0]] : []
    }

    function hasVisionModel() {
      if (!scanResult.ready) return true
      return scanResult.visionModels.some((v) => isRouteEnabled(v.provider, v.id))
    }

    // 活动路由完整信息;顺序 = 手动 routeOrder(若存在)→ 否则按性价比
    function pickRoutesInfo() {
      const active = scanResult.ready
        ? sortedVisionModels().filter((v) => isRouteEnabled(v.provider, v.id))
        : RECOMMENDED_VISION_ROUTES
            .filter((r) => isRouteEnabled(r.provider, r.model))
            .map((r) => ({ provider: r.provider, id: r.model, name: r.model, cost: null, score: null }))
      if (!scanResult.ready || !Array.isArray(config.routeOrder) || config.routeOrder.length === 0) {
        return active
      }
      const byKey = new Map()
      for (const v of active) byKey.set(routeKeyOf(v.provider, v.id), v)
      const ordered = []
      for (const key of config.routeOrder) {
        if (byKey.has(key)) { ordered.push(byKey.get(key)); byKey.delete(key) }
      }
      for (const v of byKey.values()) ordered.push(v)
      return ordered
    }

    function pickRoutes() {
      if (!config.enabled) return []
      return pickRoutesInfo().map((v) => ({ provider: v.provider, model: v.id }))
    }

    function detectGuidanceReason() {
      if (!scanResult.ready) return null
      if (scanResult.visionModels.length === 0) {
        const recProviders = new Set(RECOMMENDED_VISION_ROUTES.map((r) => r.provider))
        const anyRegistered = [...recProviders].some((p) => scanResult.providers.includes(p))
        if (!anyRegistered) return 'missing-provider'
        const credMissing = scanResult.missingCredentials.some((m) => !m.configured)
        if (credMissing) return 'missing-credential'
        return 'no-vision'
      }
      if (scanResult.visionModels.some((v) => isRouteEnabled(v.provider, v.id))) return null
      return 'all-disabled'
    }

    /* ==================== [5] 准入绕过(进程级幂等) ==================== */
    const wrapKey = '__jingqing_modality_wrap'
    if (llm && typeof llm.resolveModelInfo === 'function' && !llm[wrapKey]) {
      const state = { original: null, originals: new Map() }
      state.original = llm.resolveModelInfo
      const original = state.original
      const self = llm
      llm.resolveModelInfo = async function (provider, model, signal) {
        const info = await original.call(self, provider, model, signal)
        try {
          if (info && typeof info === 'object') {
            const key = String(provider) + '|' + String(model)
            if (!state.originals.has(key)) state.originals.set(key, info.inputModalities)
            const hasImage = Array.isArray(info.inputModalities) && info.inputModalities.includes('image')
            if (!hasImage) {
              return {
                ...info,
                inputModalities: [...(Array.isArray(info.inputModalities) ? info.inputModalities : []), 'image'],
              }
            }
          }
        } catch (e) { console.log('[鲸晴] modality-wrap', String(e)) }
        return info
      }
      llm[wrapKey] = state
      log('info', 'modality-wrap', '已安装 llm.resolveModelInfo 包装(进程级,幂等)')
    } else if (!(llm && typeof llm.resolveModelInfo === 'function')) {
      log('warn', 'modality-wrap', 'llm 服务不可用,跳过能力绕过')
    }

    async function originalInputModalities(provider, model) {
      if (!provider || !model) return undefined
      const state = llm && llm[wrapKey]
      const key = String(provider) + '|' + String(model)
      if (state) {
        if (state.originals.has(key)) return state.originals.get(key)
        if (state.original) {
          try {
            const info = await state.original(provider, model)
            if (info && typeof info === 'object') return info.inputModalities
          } catch (e) { log('warn', 'modality-probe', String(e)) }
        }
      }
      return undefined
    }

    /* ==================== [5.5] 推理输入净化(v6.1,进程级幂等) ==================== */
    // 根因:pi-ai 适配器 stream() 用自身 catalog 的 model.input 检查图片
    // (node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js:827:
    //   containsImage && !model.input.includes("image") → 抛 UNSUPPORTED_CONTENT),
    // 与 resolveModelInfo 无关,准入绕过影响不到它。纯文本模型收到含 image block
    // 的消息即抛错,整个 run 失败;失败后图片留在历史,后续 run 重放继续失败。
    // 本包装在消息进入适配器前,仅当目标模型【原生不支持 image】时把 image block
    // (含 tool-result 嵌套)替换为携带附件 ID 的占位文本;视觉模型原样透传。
    // 覆盖两条推理路径:llm.stream 与 llm.streamWithRegistration(agent loop 的
    // prepareCall.stream 最终经后者,dsh-agent-loop/lib/index.js:616)。
    const STREAM_WRAP_KEY = '__jingqing_stream_wrap'
    function attachmentIdOf(ref) {
      if (!ref || typeof ref !== 'object') return String(ref)
      return String(ref.attachmentId ?? ref.id ?? 'unknown')
    }
    function blocksHaveImage(blocks) {
      return Array.isArray(blocks) && blocks.some((b) => b && typeof b === 'object' && (
        b.type === 'image' || (b.type === 'tool-result' && blocksHaveImage(b.content))
      ))
    }
    function sanitizeBlocks(blocks) {
      const out = []
      for (const block of blocks) {
        if (!block || typeof block !== 'object') { out.push(block); continue }
        if (block.type === 'image') {
          out.push({
            type: 'text',
            text: '【用户上传的图片,附件 ID:' + attachmentIdOf(block.attachment) + '】' +
              '当前模型不支持直接查看图片,请调用 ' + TOOL_NAME + ' 工具获取图片内容。',
          })
        } else if (block.type === 'tool-result' && blocksHaveImage(block.content)) {
          out.push({ ...block, content: sanitizeBlocks(block.content) })
        } else {
          out.push(block)
        }
      }
      return out
    }
    function sanitizeMessagesIfNeeded(messages) {
      if (!Array.isArray(messages)) return messages
      let changed = false
      const out = messages.map((msg) => {
        if (!msg || typeof msg !== 'object' || !blocksHaveImage(msg.content)) return msg
        changed = true
        return { ...msg, content: sanitizeBlocks(msg.content) }
      })
      return changed ? out : messages
    }
    if (llm && typeof llm.stream === 'function' && !llm[STREAM_WRAP_KEY]) {
      const originalStream = llm.stream
      const self = llm
      llm.stream = function (options) {
        const opts = options && typeof options === 'object' ? options : {}
        const sanitized = sanitizeMessagesIfNeeded(opts.messages)
        if (sanitized === opts.messages) return originalStream.call(self, opts)
        return (async function* () {
          let nativeMods
          try { nativeMods = await originalInputModalities(opts.provider, opts.model) } catch (e) { nativeMods = undefined }
          const supportsImage = Array.isArray(nativeMods) && nativeMods.includes('image')
          if (supportsImage) {
            yield* originalStream.call(self, opts)
          } else {
            log('info', 'stream-sanitize', {
              provider: String(opts.provider),
              model: String(opts.model),
              nativeMods: nativeMods === undefined ? 'unknown' : nativeMods,
            })
            yield* originalStream.call(self, { ...opts, messages: sanitized })
          }
        })()
      }
      llm[STREAM_WRAP_KEY] = true
      log('info', 'stream-wrap', '已安装 llm.stream 输入净化包装(v5,进程级,幂等)')
    } else if (!(llm && typeof llm.stream === 'function')) {
      log('warn', 'stream-wrap', 'llm 服务不可用,跳过输入净化')
    }

    const STREAM_WITH_REG_KEY = '__jingqing_stream_with_reg_wrap'
    if (llm && typeof llm.streamWithRegistration === 'function' && !llm[STREAM_WITH_REG_KEY]) {
      const originalSWR = llm.streamWithRegistration
      const self = llm
      llm.streamWithRegistration = function (options, prepared) {
        const opts = options && typeof options === 'object' ? options : {}
        const sanitized = sanitizeMessagesIfNeeded(opts.messages)
        if (sanitized === opts.messages) return originalSWR.call(self, opts, prepared)
        return (async function* () {
          let nativeMods
          try { nativeMods = await originalInputModalities(opts.provider, opts.model) } catch (e) { nativeMods = undefined }
          const supportsImage = Array.isArray(nativeMods) && nativeMods.includes('image')
          if (supportsImage) {
            yield* originalSWR.call(self, opts, prepared)
          } else {
            log('info', 'stream-sanitize', {
              provider: String(opts.provider),
              model: String(opts.model),
              nativeMods: nativeMods === undefined ? 'unknown' : nativeMods,
              via: 'streamWithRegistration',
            })
            yield* originalSWR.call(self, { ...opts, messages: sanitized }, prepared)
          }
        })()
      }
      llm[STREAM_WITH_REG_KEY] = true
      log('info', 'stream-with-reg-wrap', '已安装 llm.streamWithRegistration 输入净化包装(v6,覆盖 agent loop prepareCall 路径)')
    } else if (!(llm && typeof llm.streamWithRegistration === 'function')) {
      log('warn', 'stream-with-reg-wrap', 'llm.streamWithRegistration 不可用,跳过(如推理仍失败请检查 dsh-llm 版本)')
    }

    function currentSelectionOf(agent) {
      try {
        const adm = ctx.get('agentDefaultModel')
        if (adm && typeof adm.currentSelection === 'function') {
          const sel = adm.currentSelection()
          if (sel && typeof sel.provider === 'string' && sel.provider && typeof sel.model === 'string' && sel.model) return sel
        }
      } catch (e) { log('warn', 'selection', String(e)) }
      const options = agent && agent.options ? agent.options : {}
      return { provider: options.provider, model: options.model }
    }

    /* ==================== [6] 配置引导(无识图模型时) ==================== */
    function guidanceText(reason) {
      const lines = [
        '【鲸晴·配置引导】当前环境没有可用的图像识别模型,无法自动识图。',
        '',
        '鲸晴推荐安装 mimoV2.5(小米 MiMo V2.5):',
        '- 性价比最高:输入约 $0.14 / 输出约 $0.28 每百万 token',
        '- 支持文本 + 图像双模态,中文识别质量好',
        '',
        '配置文档网页:',
        '- 小米 MiMo 开放平台:https://mimo.mi.com',
        '- 快速开始(首次 API 调用):https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call',
        '',
        '启用步骤:',
        '1. 按上述文档注册并获取 API Key;',
      ]
      if (reason === 'all-disabled') {
        lines.push('2. 当前所有识图模型均已被关闭:请在「设置 → 鲸晴」中启用至少一个识图模型;')
        lines.push('   推荐启用 xiaomi/mimo-v2.5(或按下方步骤重新配置)。')
      } else if (reason === 'missing-provider') {
        lines.push('2. 在 DeepSeek Harness「设置 → 模型」中添加提供方 xiaomi(模型 mimo-v2.5),')
        lines.push('   并将 Key 写入 ~/.dsh/.credentials.yaml 的 XIAOMI_API_KEY(或环境变量 XIAOMI_API_KEY);')
      } else if (reason === 'missing-credential') {
        lines.push('2. 提供方已配置但 API Key 缺失:将 Key 写入 ~/.dsh/.credentials.yaml 的 XIAOMI_API_KEY,')
        lines.push('   或设置环境变量 XIAOMI_API_KEY;')
      } else {
        lines.push('2. 在 DeepSeek Harness「设置 → 模型」中添加支持图片输入的模型,')
        lines.push('   推荐 provider: xiaomi,模型: mimo-v2.5(环境变量 XIAOMI_API_KEY);')
      }
      lines.push('3. 备用通道:provider opencode-go 同样提供 mimo-v2.5(环境变量 OPENCODE_GO_API_KEY);')
      lines.push('4. 配置保存后鲸晴会自动检测并立即启用识图,无需重启。')
      return lines.join('\n')
    }

    function makeGuidanceNotice(reason) {
      return {
        id: 'jingqing-guidance-' + Date.now(),
        role: 'user',
        content: [{ type: 'text', text: guidanceText(reason) }],
        source: {
          kind: 'plugin', plugin: PLUGIN_LABEL, form: 'notice',
          summary: '鲸晴:未检测到可用的识图模型,展开查看配置引导…',
        },
      }
    }

    function guidanceErrorText(reason) {
      return '当前环境没有可用的图像识别模型,识图失败。' +
        (reason ? '\n' + guidanceText(reason) : '')
    }

    /* ==================== [7] 图片检测与注入 ==================== */
    function collectImages(messages) {
      const out = []
      if (!Array.isArray(messages)) return out
      for (const msg of messages) {
        const blocks = msg && Array.isArray(msg.content) ? msg.content : []
        for (const block of blocks) {
          if (block && block.type === 'image' && block.attachment && typeof block.attachment === 'object') {
            out.push({
              attachmentId: String(block.attachment.attachmentId),
              mediaType: block.attachment.mediaType,
              bytes: block.attachment.bytes,
              width: block.attachment.width,
              height: block.attachment.height,
              name: typeof block.attachment.name === 'string' ? block.attachment.name : undefined,
            })
          }
        }
      }
      return out
    }

    let noticeSeq = 0
    function makeInstructionNotice(images) {
      const ids = images.map((im) => im.attachmentId)
      const text =
        '【鲸晴·识图】用户上传了图片,但当前对话模型不支持直接查看图片。\n' +
        '请调用 ' + TOOL_NAME + ' 工具识别图片内容,规则如下:\n' +
        '- 每张图片调用一次本工具;\n' +
        '- 参数 image_ref 传图片附件 ID(如下所列);\n' +
        '- 参数 question 传用户针对该图片的问题(如有)。\n' +
        '图片附件 ID 列表:' + ids.join('、') + '\n' +
        '工具会调用视觉模型返回图片的详细描述;获得描述后,请基于描述回答用户的问题。'
      return {
        id: 'jingqing-notice-' + Date.now() + '-' + (++noticeSeq),
        role: 'user',
        content: [{ type: 'text', text }],
        source: {
          kind: 'plugin', plugin: PLUGIN_LABEL, form: 'notice',
          summary: '鲸晴:检测到图片,正在调用视觉模型识别图片内容…',
        },
      }
    }

    // agent/pre-step 瀑布:先 next() 得默认决策,再追加 plugin-notice 消息
    ctx.on('agent/pre-step', async (payload, next) => {
      let inject = null
      try {
        const images = collectImages(payload.messages)
        if (images.length > 0 && !(payload.signal && payload.signal.aborted) && config.enabled) {
          const sel = currentSelectionOf(payload.agent)
          const mods = await originalInputModalities(sel.provider, sel.model)
          const nativeVision = Array.isArray(mods) && mods.includes('image')
          if (!nativeVision) {
            if (hasVisionModel()) inject = { kind: 'instruction' }
            else {
              const reason = detectGuidanceReason()
              if (reason) inject = { kind: 'guidance', reason }
            }
          }
          log('info', 'pre-step', {
            images: images.length,
            model: (sel.provider || '?') + '/' + (sel.model || '?'),
            nativeVision,
            inject: inject ? inject.kind : 'none',
          })
        }
      } catch (e) { log('error', 'pre-step-check', String(e)) }
      const decision = await next()
      if (!inject || !decision || decision.kind !== 'enter') return decision
      try {
        const notice = inject.kind === 'instruction'
          ? makeInstructionNotice(collectImages(payload.messages))
          : makeGuidanceNotice(inject.reason)
        return { kind: 'enter', messages: [...(decision.messages || []), notice] }
      } catch (e) { log('error', 'pre-step-inject', String(e)); return decision }
    })

    /* ==================== [8] 识图工具 ==================== */
    function resolveImageRef(agent, attachmentId) {
      const want = String(attachmentId)
      if (!agent || !agent.session || !Array.isArray(agent.session.events)) return undefined
      const events = agent.session.events
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i]
        if (!ev || ev.type !== 'user/message' || !ev.data || !Array.isArray(ev.data.content)) continue
        for (const block of ev.data.content) {
          if (block && block.type === 'image' && block.attachment && String(block.attachment.attachmentId) === want) {
            return block.attachment
          }
        }
      }
      return undefined
    }

    async function callVisionRoute(llmSvc, route, imageRef, question, signal, startedAt) {
      const prompt =
        '你是一个专业的图像理解引擎。请仔细观察用户提供的图片,输出准确、结构清晰的中文描述(控制在 300 字以内):' +
        '主体内容、场景、人物/物体及其关系、图片中的文字(如有)、颜色与构图等关键细节。\n' +
        (question ? '用户的问题:' + question : '最后用一句话概括这张图片。')
      const message = {
        id: 'jingqing-' + Date.now(),
        role: 'user',
        content: [
          { type: 'image', attachment: imageRef },
          { type: 'text', text: prompt },
        ],
        source: { kind: 'user' },
      }
      const options = {
        provider: route.provider,
        model: route.model,
        messages: [message],
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        signal: signal || undefined,
      }
      const stream = llmSvc.stream(options)
      let text = ''
      let reasoning = ''
      let usage = null
      let finish = null
      for await (const chunk of stream) {
        if (signal && signal.aborted) throw new Error('识图调用已取消。')
        if (Date.now() - startedAt > config.timeoutMs) {
          throw new Error('识图超时(超过 ' + Math.round(config.timeoutMs / 1000) + ' 秒)。')
        }
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'reasoning-delta') reasoning += chunk.text
        else if (chunk.type === 'usage') usage = chunk.usage
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
        const msg = finish.failure && finish.failure.message ? finish.failure.message : String(finish.kind)
        throw new Error(route.provider + '/' + route.model + ' 调用失败: ' + msg)
      }
      const out = (text || reasoning || '').trim()
      if (!out) throw new Error(route.provider + '/' + route.model + ' 返回了空内容')
      return { text: out, usage, finishKind: finish ? finish.kind : 'unknown' }
    }

    const tool = defineTool({
      name: TOOL_NAME,
      description:
        '识别用户上传的图片内容。本工具自动选择可用的视觉模型(按性价比推荐,首选小米 MiMo mimo-v2.5)' +
        '理解图片并返回详细的中文描述。当用户消息中包含图片(系统会通过上下文注明图片附件 ID)时,' +
        '必须调用本工具获取图片内容,再基于描述回答用户。',
      parameters: {
        image_ref: { type: 'string', required: true, description: '图片附件 ID(attachmentId),来自用户上传的图片消息。' },
        question: { type: 'string', description: '用户针对该图片提出的问题(可选)。' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: String((value && value.description) || '') }],
      },
      async execute(args, exec) {
        const startedAt = Date.now()
        if (!config.enabled) {
          throw new Error('鲸晴已停用:请在「设置 → 鲸晴」中重新启用识图自动流程。')
        }
        const agent = exec && exec.agent
        const imageRef = resolveImageRef(agent, args.image_ref)
        if (!imageRef) {
          throw new Error(
            '在会话中找不到附件 ' + String(args.image_ref) + '。' +
            '请确认 image_ref 来自用户上传图片的消息(以上下文注明的附件 ID 为准),不要臆造 ID。'
          )
        }
        const attachments = ctx.get('attachments')
        const llmSvc = ctx.get('llm')
        if (!attachments || !llmSvc) throw new Error('鲸晴所需服务(attachments/llm)不可用。')
        if (exec.signal && exec.signal.aborted) throw new Error('识图调用已取消。')
        await attachments.readImage(imageRef, exec.signal)
        const routes = pickRoutes()
        if (routes.length === 0) {
          throw new Error(guidanceErrorText(detectGuidanceReason() || 'no-vision'))
        }
        let lastError = null
        for (const route of routes) {
          if (exec.signal && exec.signal.aborted) break
          try {
            const res = await callVisionRoute(
              llmSvc,
              route,
              imageRef,
              typeof args.question === 'string' ? args.question : undefined,
              exec.signal,
              startedAt
            )
            const image = {
              attachmentId: String(imageRef.attachmentId),
              mediaType: imageRef.mediaType,
              width: imageRef.width,
              height: imageRef.height,
              name: typeof imageRef.name === 'string' ? imageRef.name : undefined,
            }
            log('info', 'describe-ok', {
              provider: route.provider,
              model: route.model,
              ms: Date.now() - startedAt,
              image: image.attachmentId,
            })
            return {
              description: res.text,
              provider: route.provider,
              model: route.model,
              usage: res.usage,
              finishReason: res.finishKind,
              durationMs: Date.now() - startedAt,
              image,
            }
          } catch (e) {
            lastError = e
            log('warn', 'describe-route-failed', { provider: route.provider, model: route.model, error: String(e) })
          }
        }
        throw lastError || new Error('识图失败。')
      },
      presentCall: (args) => ({
        card: 'generic',
        title: '鲸晴 · 识图',
        kind: 'other',
        rawInput: { image_ref: args.image_ref, question: args.question },
      }),
      presentResult: (_args, result) => ({
        card: 'generic',
        title: '鲸晴 · 识图完成',
        content: result.content,
      }),
      timeoutMs: 60000,
    })
    ctx.tools.register(tool)

    /* ==================== [9] 诊断工具 ==================== */
    const diagTool = defineTool({
      name: DIAG_TOOL_NAME,
      description:
        '鲸晴诊断工具:报告模型扫描快照、凭据状态、准入包装、运行时配置、引导判定。仅用于排障。',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(_args, exec) {
        const agent = exec && exec.agent
        const sel = currentSelectionOf(agent)
        const state = llm && llm[wrapKey]
        let admissionView = null
        let originalView = null
        try {
          if (state) originalView = await originalInputModalities(sel.provider, sel.model) ?? null
          if (llm && sel.provider && sel.model) {
            const info = await llm.resolveModelInfo(sel.provider, sel.model)
            admissionView = info && Array.isArray(info.inputModalities) ? info.inputModalities : null
          }
        } catch (e) {
          log('error', 'diag', String(e))
          return { error: String(e) }
        }
        const sorted = sortedVisionModels()
        return {
          sessionId: agent && agent.id ? String(agent.id) : null,
          selection: sel,
          mode: 'static',
          wrapInstalled: Boolean(state),
          wrapperActive: Boolean(state && llm && typeof llm.resolveModelInfo === 'function' && llm.resolveModelInfo !== state.original),
          streamWrapActive: Boolean(llm && llm[STREAM_WRAP_KEY] && typeof llm.stream === 'function'),
          streamWithRegActive: Boolean(llm && llm[STREAM_WITH_REG_KEY] && typeof llm.streamWithRegistration === 'function'),
          admissionView,
          originalView,
          wouldReject: Array.isArray(admissionView) && !admissionView.includes('image'),
          config: {
            enabled: config.enabled,
            routesEnabled: config.routesEnabled,
            routeOrder: Array.isArray(config.routeOrder) ? [...config.routeOrder] : [],
            timeoutMs: config.timeoutMs,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
          },
          scan: {
            ready: scanResult.ready,
            providers: scanResult.providers,
            visionModels: sorted.map((v) => ({
              provider: v.provider,
              id: v.id,
              name: v.name,
              cost: v.cost,
              score: v.score,
              enabled: isRouteEnabled(v.provider, v.id),
              credential: credentialOf(v.provider),
            })),
            missingCredentials: scanResult.missingCredentials,
            errors: scanResult.errors,
            scannedAt: scanResult.scannedAt,
          },
          recommended: recommendedOf().map((r) => r.provider + '/' + r.id),
          hasVisionModel: hasVisionModel(),
          guidanceReason: detectGuidanceReason(),
          routes: pickRoutes(),
        }
      },
    })
    ctx.tools.register(diagTool)

    /* ==================== [10] 桥接接口(供动态面板包读写,共享 llm 对象) ==================== */
    // 动态面板包(Client UI)通过 llm.__jingqing_static 读取/修改本插件的真实配置,
    // 实现「识图核心静态永久 + 面板动态按需激活」的共存模式。
    function panelState() {
      const sel = currentSelectionOf()
      const state = llm && llm[wrapKey]
      let admissionView = null
      try {
        if (llm && sel.provider && sel.model) {
          const info = llm.resolveModelInfo(sel.provider, sel.model)
          if (info && Array.isArray(info.inputModalities)) admissionView = info.inputModalities
        }
      } catch (e) { log('warn', 'panel-state', String(e)) }
      const sorted = sortedVisionModels()
      return {
        version: VERSION,
        config: {
          enabled: config.enabled,
          routesEnabled: { ...config.routesEnabled },
          routeOrder: Array.isArray(config.routeOrder) ? [...config.routeOrder] : [],
          timeoutMs: config.timeoutMs,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
        },
        runtime: {
          running: true,
          mode: 'static',
          wrapActive: Boolean(state),
          streamWrapActive: Boolean(llm && llm[STREAM_WRAP_KEY]),
          streamWithRegActive: Boolean(llm && llm[STREAM_WITH_REG_KEY]),
          admissionView,
          wouldReject: Array.isArray(admissionView) && !admissionView.includes('image'),
        },
        scan: {
          ready: scanResult.ready,
          scannedAt: scanResult.scannedAt,
          providers: scanResult.providers,
          visionModels: sorted.map((v) => ({
            provider: v.provider,
            id: v.id,
            name: v.name,
            cost: v.cost,
            score: v.score,
            enabled: isRouteEnabled(v.provider, v.id),
            credential: credentialOf(v.provider),
          })),
          missingCredentials: scanResult.missingCredentials,
          errors: scanResult.errors,
        },
        guidance: {
          reason: detectGuidanceReason(),
          hasVisionModel: hasVisionModel(),
        },
        recommended: recommendedOf().map((r) => r.provider + '/' + r.model),
        routes: pickRoutesInfo(),
        logs: logBuffer.slice(-20),
      }
    }

    const bridgeKey = '__jingqing_static'
    if (llm && !llm[bridgeKey]) {
      llm[bridgeKey] = {
        mode: 'static',
        version: VERSION,
        getState: () => panelState(),
        applyPatch: (patch) => {
          const result = applyConfigPatch(patch)
          if (!result.ok) {
            log('warn', 'bridge-update-rejected', result.error)
            return { error: result.error, state: panelState() }
          }
          log('info', 'bridge-update', result.config)
          return { state: panelState() }
        },
        rescan: async () => {
          await scan()
          return { state: panelState() }
        },
        reset: () => {
          config = { ...DEFAULT_CONFIG, routesEnabled: {} }
          ensureRouteKeys()
          log('info', 'bridge-reset', '配置已恢复默认')
          return { state: panelState() }
        },
        getLogs: (limit, level) => {
          const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 100
          const filtered = level === 'all' || !level ? logBuffer : logBuffer.filter((e) => e.level === level)
          return { logs: filtered.slice(-n) }
        },
      }
      log('info', 'bridge', '已挂载 llm.__jingqing_static 桥接(供动态面板包)')
    }

    /* ==================== [11] HTTP API 端点(静态面板数据源) ==================== */
    // 静态 Client 半区通过 fetch("/api/jingqing/*") 获取数据(与 dsh-usage-stats 同机制)
    const webServer = ctx.get('webServer')
    if (webServer && typeof webServer.register === 'function') {
      const json = (res, status, value) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/api/jingqing/state',
        handler: (_req, res) => json(res, 200, { ok: true, state: panelState() }),
      }), 'jingqing: state endpoint')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/api/jingqing/update',
        handler: (req, res) => {
          let body = ''
          req.on('data', (chunk) => { body += chunk })
          req.on('end', () => {
            try {
              const args = JSON.parse(body || '{}')
              const result = applyConfigPatch(args && args.patch)
              if (!result.ok) { json(res, 400, { ok: false, error: result.error, state: panelState() }); return }
              log('info', 'http-update', result.config)
              json(res, 200, { ok: true, state: panelState() })
            } catch (e) {
              json(res, 400, { ok: false, error: String(e), state: panelState() })
            }
          })
        },
      }), 'jingqing: update endpoint')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/api/jingqing/rescan',
        handler: async (_req, res) => {
          await scan()
          json(res, 200, { ok: true, state: panelState() })
        },
      }), 'jingqing: rescan endpoint')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/api/jingqing/logs',
        handler: (req, res) => {
          try {
            const url = new URL(req.url, 'http://localhost')
            const limit = Number(url.searchParams.get('limit') || 100)
            const level = url.searchParams.get('level') || 'all'
            const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 100
            const filtered = level === 'all' ? logBuffer : logBuffer.filter((e) => e.level === level)
            json(res, 200, { ok: true, logs: filtered.slice(-n) })
          } catch (e) {
            json(res, 400, { ok: false, error: String(e) })
          }
        },
      }), 'jingqing: logs endpoint')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/api/jingqing/reset',
        handler: (_req, res) => {
          config = { ...DEFAULT_CONFIG, routesEnabled: {} }
          ensureRouteKeys()
          log('info', 'http-reset', '配置已恢复默认')
          json(res, 200, { ok: true, state: panelState() })
        },
      }), 'jingqing: reset endpoint')
      log('info', 'http-api', '已注册 /api/jingqing/* 端点(供静态面板)')
    } else {
      log('warn', 'http-api', 'webServer 服务不可用,跳过 HTTP 端点注册')
    }

    /* ==================== [12] 启动 ==================== */
    void scan()
    log('info', 'started', {
      version: VERSION,
      tool: TOOL_NAME,
      mode: 'static',
      modalityWrapActive: Boolean(llm && llm[wrapKey]),
    })
}

export { apply, inject, name }
