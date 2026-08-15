请帮我安装【鲸晴 JingQing】插件(DeepSeek Harness 动态 Cordis 插件,让纯文本对话模型也能识别图片:图片交给视觉模型 mimo-v2.5 识别,结果交回当前模型继续推理)。

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
/**
 * 鲸晴 (JingQing) — 动态 Cordis 插件 · Host 半区（v1.0.0 · 正式版）
 * ============================================================
 * v1.0.0（自 v7.3.1 收敛的正式发布版）：
 *   [F] 手动路由顺序 routeOrder：设置页「识图路由」卡可拖拽模型调整调用顺序
 *       （Client FLIP 让位动画）；顺序存 config.routeOrder（provider|model 键数组），
 *       空数组 = 按性价比排序；panel/update 支持提交 routeOrder；
 *       pickRoutesInfo() 按 routeOrder 顺序输出活动路由，新模型追加末尾；
 *       reset 恢复为空（回性价比排序）。
 *   [D] 跨 apply 生命周期诊断计数（llm.__jingqing_meta）定位「每次打开配置页
 *       都像需要重新扫描」；Client 面板沙箱 API 修正与加载/错误重试态；
 *       模型检测卡不含价格（价格仅保留在识图路由卡）。
 * v7.2 变更：扫描策略 —— 安装/激活时首次自动扫描一次；之后保留扫描结果，
 *   不再因 llm/adapters-updated、credentials/updated 自动重扫；
 *   重扫完全由用户手动触发（设置页「立即重扫」/ panel/rescan RPC）。
 * v7 在 v6 基础上新增（对应 CLIENT-PANEL-DESIGN 风格A规格）：
 *   A. PanelConfig：可运行时调整的内存配置（enabled/逐模型路由启停/超时/Token/温度），
 *      即时生效，供 Client 面板读写；
 *   B. 性价比排序：内置 MODEL_COST_TABLE（来源 pi-ai 目录 cost 字段），
 *      score = 输入价×0.5 + 输出价×0.5，升序；同分按推荐提供方/模型稳定序；
 *      推荐 = 已安装识图模型中性价比最高者（动态）；
 *   C. 模型扫描结果平铺：全部已配置的识图模型（含 cost/score/凭据/启停状态）；
 *   D. PanelRpc：jingqing/panel/{state|update|rescan|logs|reset} 五个 JSON RPC；
 *   E. 引导更新：无识图模型时推荐安装 mimoV2.5 并附官方配置文档链接；
 *      新增 all-disabled 原因。
 *
 * 沙箱注意事项沿用：无 AbortController（exec.signal 透传+循环耗时检查）；
 * 准入包装进程级幂等（不注册 fiber effect，避免 HMR 重载还原）。
 *
 * 用法：本文件为 cordis_define(code.host) 的函数体；Client 半区见 plugin-client.js。
 */
return {
  inject: ['timer'],
  apply(ctx) {
    /* ==================== [0] 配置 ==================== */
    const PLUGIN_LABEL = '鲸晴'
    const TOOL_NAME = 'jingqing_describe_image'
    const DIAG_TOOL_NAME = 'jingqing_diag'
    const VERSION = 'v1.0.0'
    const RECOMMENDED_VISION_ROUTES = [
      { provider: 'xiaomi', model: 'mimo-v2.5' },
      { provider: 'opencode-go', model: 'mimo-v2.5' },
    ]
    // 内置成本表（美元/百万 token），来源：pi-ai 模型目录 cost 字段（2026-08 快照）
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
      routeOrder: [], // v7.3.0：手动路由顺序（provider|model 键数组，空 = 按性价比）
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

    /* ==================== [D] 跨 apply 生命周期诊断计数 ==================== */
    const metaKey = '__jingqing_meta'
    const meta = (llm && llm[metaKey]) || (llm && (llm[metaKey] = {
      hostApplyCount: 0,
      scanCount: 0,
      panelStateCalls: 0,
      firstApplyAt: Date.now(),
      lastApplyAt: null,
    }))
    if (meta) {
      meta.hostApplyCount += 1
      meta.lastApplyAt = Date.now()
    }

    /* ==================== [2] PanelConfig（内存配置，即时生效） ==================== */
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

    // 性价比评分：输入价×0.5 + 输出价×0.5（越小越优）
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

    // v7.2 扫描策略：仅 apply 首次与手动 rescan 触发；不再监听事件自动重扫
    async function scan() {
      if (scanning) return scanPromise
      scanning = true
      scanPromise = (async () => {
        if (meta) meta.scanCount += 1
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
            recommended: recommendedOf().map((r) => r.provider + '/' + r.id),
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

    // v7.3.0：活动路由完整信息（含 cost/score/enabled）。
    // 顺序 = 手动 routeOrder（若存在）→ 否则按性价比；routeOrder 未覆盖的新模型追加末尾。
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

    /* ==================== [5] 准入绕过（进程级幂等） ==================== */
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
      log('info', 'modality-wrap', '已安装 llm.resolveModelInfo 包装（进程级，幂等）')
    } else if (!(llm && typeof llm.resolveModelInfo === 'function')) {
      log('warn', 'modality-wrap', 'llm 服务不可用，跳过能力绕过')
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

    /* ==================== [6] 配置引导（无识图模型时） ==================== */
    function guidanceText(reason) {
      const lines = [
        '【鲸晴·配置引导】当前环境没有可用的图像识别模型，无法自动识图。',
        '',
        '鲸晴推荐安装 mimoV2.5（小米 MiMo V2.5）：',
        '- 性价比最高：输入约 $0.14 / 输出约 $0.28 每百万 token',
        '- 支持文本 + 图像双模态，中文识别质量好',
        '',
        '配置文档网页：',
        '- 小米 MiMo 开放平台：https://mimo.mi.com',
        '- 快速开始（首次 API 调用）：https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call',
        '',
        '启用步骤：',
        '1. 按上述文档注册并获取 API Key；',
      ]
      if (reason === 'all-disabled') {
        lines.push('2. 当前所有识图模型均已被关闭：请在「设置 → 鲸晴」中启用至少一个识图模型；')
        lines.push('   推荐启用 xiaomi/mimo-v2.5（或按下方步骤重新配置）。')
      } else if (reason === 'missing-provider') {
        lines.push('2. 在 DeepSeek Harness「设置 → 模型」中添加提供方 xiaomi（模型 mimo-v2.5），')
        lines.push('   并将 Key 写入 ~/.dsh/.credentials.yaml 的 XIAOMI_API_KEY（或环境变量 XIAOMI_API_KEY）；')
      } else if (reason === 'missing-credential') {
        lines.push('2. 提供方已配置但 API Key 缺失：将 Key 写入 ~/.dsh/.credentials.yaml 的 XIAOMI_API_KEY，')
        lines.push('   或设置环境变量 XIAOMI_API_KEY；')
      } else {
        lines.push('2. 在 DeepSeek Harness「设置 → 模型」中添加支持图片输入的模型，')
        lines.push('   推荐 provider: xiaomi，模型: mimo-v2.5（环境变量 XIAOMI_API_KEY）；')
      }
      lines.push('3. 备用通道：provider opencode-go 同样提供 mimo-v2.5（环境变量 OPENCODE_GO_API_KEY）；')
      lines.push('4. 配置保存后鲸晴会自动检测并立即启用识图，无需重启。')
      return lines.join('\n')
    }

    function makeGuidanceNotice(reason) {
      return {
        id: 'jingqing-guidance-' + Date.now(),
        role: 'user',
        content: [{ type: 'text', text: guidanceText(reason) }],
        source: {
          kind: 'plugin', plugin: PLUGIN_LABEL, form: 'notice',
          summary: '鲸晴：未检测到可用的识图模型，展开查看配置引导…',
        },
      }
    }

    function guidanceErrorText(reason) {
      return '当前环境没有可用的图像识别模型，识图失败。' +
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
        '【鲸晴·识图】用户上传了图片，但当前对话模型不支持直接查看图片。\n' +
        '请调用 ' + TOOL_NAME + ' 工具识别图片内容，规则如下：\n' +
        '- 每张图片调用一次本工具；\n' +
        '- 参数 image_ref 传图片附件 ID（如下所列）；\n' +
        '- 参数 question 传用户针对该图片的问题（如有）。\n' +
        '图片附件 ID 列表：' + ids.join('、') + '\n' +
        '工具会调用视觉模型返回图片的详细描述；获得描述后，请基于描述回答用户的问题。'
      return {
        id: 'jingqing-notice-' + Date.now() + '-' + (++noticeSeq),
        role: 'user',
        content: [{ type: 'text', text }],
        source: {
          kind: 'plugin', plugin: PLUGIN_LABEL, form: 'notice',
          summary: '鲸晴：检测到图片，正在调用视觉模型识别图片内容…',
        },
      }
    }

    // agent/pre-step 瀑布：先 next() 得默认决策，再追加 plugin-notice 消息（可折叠上下文行）
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
        '你是一个专业的图像理解引擎。请仔细观察用户提供的图片，输出准确、结构清晰的中文描述（控制在 300 字以内）：' +
        '主体内容、场景、人物/物体及其关系、图片中的文字（如有）、颜色与构图等关键细节。\n' +
        (question ? '用户的问题：' + question : '最后用一句话概括这张图片。')
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
          throw new Error('识图超时（超过 ' + Math.round(config.timeoutMs / 1000) + ' 秒）。')
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

    const tool = harness.defineTool({
      name: TOOL_NAME,
      description:
        '识别用户上传的图片内容。本工具自动选择可用的视觉模型（按性价比推荐，首选小米 MiMo mimo-v2.5）' +
        '理解图片并返回详细的中文描述。当用户消息中包含图片（系统会通过上下文注明图片附件 ID）时，' +
        '必须调用本工具获取图片内容，再基于描述回答用户。',
      parameters: {
        image_ref: { type: 'string', required: true, description: '图片附件 ID（attachmentId），来自用户上传的图片消息。' },
        question: { type: 'string', description: '用户针对该图片提出的问题（可选）。' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: String((value && value.description) || '') }],
      },
      async execute(args, exec) {
        const startedAt = Date.now()
        if (!config.enabled) {
          throw new Error('鲸晴已停用：请在「设置 → 鲸晴」中重新启用识图自动流程。')
        }
        const agent = exec && exec.agent
        const imageRef = resolveImageRef(agent, args.image_ref)
        if (!imageRef) {
          throw new Error(
            '在会话中找不到附件 ' + String(args.image_ref) + '。' +
            '请确认 image_ref 来自用户上传图片的消息（以上下文注明的附件 ID 为准），不要臆造 ID。'
          )
        }
        const attachments = ctx.get('attachments')
        const llmSvc = ctx.get('llm')
        if (!attachments || !llmSvc) throw new Error('鲸晴所需服务（attachments/llm）不可用。')
        if (exec.signal && exec.signal.aborted) throw new Error('识图调用已取消。')
        await attachments.readImage(imageRef, exec.signal)
        const routes = pickRoutes()
        if (routes.length === 0) {
          throw new Error(guidanceErrorText(detectGuidanceReason() || 'no-vision'))
        }
        try {
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
        } finally {
          // 无控制器/定时器需要清理（沙箱限制）
        }
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
    harness.registerTool(ctx, tool)

    /* ==================== [9] 诊断工具 ==================== */
    const diagTool = harness.defineTool({
      name: DIAG_TOOL_NAME,
      description:
        '鲸晴诊断工具：报告模型扫描快照、凭据状态、准入包装、运行时配置、引导判定与生命周期计数。仅用于排障。',
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
          lifecycle: meta ? {
            hostApplyCount: meta.hostApplyCount,
            scanCount: meta.scanCount,
            panelStateCalls: meta.panelStateCalls,
            firstApplyAt: meta.firstApplyAt,
            lastApplyAt: meta.lastApplyAt,
          } : null,
          wrapInstalled: Boolean(state),
          wrapperActive: Boolean(state && llm && typeof llm.resolveModelInfo === 'function' && llm.resolveModelInfo !== state.original),
          admissionView,
          originalView,
          wouldReject: Array.isArray(admissionView) && !admissionView.includes('image'),
          config: {
            enabled: config.enabled,
            routesEnabled: config.routesEnabled,
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
    harness.registerTool(ctx, diagTool)

    /* ==================== [10] PanelRpc ==================== */
    async function panelState() {
      if (meta) meta.panelStateCalls += 1
      const sel = currentSelectionOf()
      const state = llm && llm[wrapKey]
      let admissionView = null
      try {
        if (llm && sel.provider && sel.model) {
          const info = await llm.resolveModelInfo(sel.provider, sel.model)
          admissionView = info && Array.isArray(info.inputModalities) ? info.inputModalities : null
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
          wrapActive: Boolean(state),
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
        recommended: recommendedOf().map((r) => r.provider + '/' + r.id),
        routes: pickRoutesInfo(),
        logs: logBuffer.slice(-20),
      }
    }

    harness.handle('jingqing/panel/state', async () => {
      return panelState()
    })
    harness.handle('jingqing/panel/update', async (args) => {
      const result = applyConfigPatch(args && args.patch)
      if (!result.ok) {
        log('warn', 'panel-update-rejected', result.error)
        return { error: result.error, state: await panelState() }
      }
      log('info', 'panel-update', result.config)
      return { state: await panelState() }
    })
    harness.handle('jingqing/panel/rescan', async () => {
      await scan()
      return { state: await panelState() }
    })
    harness.handle('jingqing/panel/logs', async (args) => {
      const limit = args && Number.isInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 100) : 100
      const level = args && typeof args.level === 'string' ? args.level : 'all'
      const filtered = level === 'all' ? logBuffer : logBuffer.filter((e) => e.level === level)
      return { logs: filtered.slice(-limit) }
    })
    harness.handle('jingqing/panel/reset', async () => {
      config = { ...DEFAULT_CONFIG, routesEnabled: {} }
      ensureRouteKeys()
      log('info', 'panel-reset', '配置已恢复默认')
      return { state: await panelState() }
    })

    harness.handle('jingqing/status', () => ({
      name: '鲸晴 JingQing ' + VERSION,
      tool: TOOL_NAME,
      activeRoutes: pickRoutes(),
      recommended: recommendedOf().map((r) => r.provider + '/' + r.id),
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      enabled: config.enabled,
      scanReady: scanResult.ready,
      visionModelCount: scanResult.visionModels.length,
      guidanceReason: detectGuidanceReason(),
      modalityWrapActive: Boolean(llm && llm[wrapKey]),
      logCount: logBuffer.length,
    }))
    harness.handle('jingqing/logs', () => ({ logs: logBuffer.slice(-100) }))

    /* ==================== [11] 启动 ==================== */
    void scan()
    log('info', 'started', {
      version: VERSION,
      tool: TOOL_NAME,
      panelRpc: ['state', 'update', 'rescan', 'logs', 'reset'],
      lifecycle: meta ? { applies: meta.hostApplyCount, scans: meta.scanCount } : null,
      modalityWrapActive: Boolean(llm && llm[wrapKey]),
    })
  },
}

========== [HOST 源码] 结束 ==========

========== [CLIENT 源码] 开始 ==========
/**
 * 鲸晴 (JingQing) — 动态 Cordis 插件 · Client 半区（v1.0.0 · 正式版）
 * ============================================================
 * v1.0.0（自 v7.3.1 收敛的正式发布版）：
 * 「模型检测结果」卡删除价格列（价格只保留在「识图路由」卡）；
 * 识图路由拖拽加入 FLIP 让位动画（重排平滑滑动 + 悬停虚线高亮 + 拖动微缩放）；
 * 识图路由卡可拖拽手动排序（HTML5 DnD，提交 config.routeOrder）；
 * 设置页含「加载中 / 加载失败(可重试)」状态。
 * 按 STYLE-A-MINIMAL-SPEC.md 实现：
 *   - 设置页 settings.section(id=jingqing, order=25, label=鲸晴)
 *     F7 运行卡片状态条 · F1 状态总览 · F2 模型检测结果(全部识图模型+逐模型启停)
 *     F3 识图路由(可拖动排序) · F4 配置(总开关/参数/恢复默认,即时生效)
 *     F5 日志(级别过滤/刷新)
 *   - 运行卡片状态区 tool.view.cordis(key=self):状态徽标 + 打开设置
 *   - 双主题(跟随系统 + 右上角手动切换);全部数据经 host.call 的
 *     jingqing/panel/{state|update|rescan|logs|reset} JSON RPC 获取/提交
 * 纯 JS + React.createElement,无 JSX/TS。
 */
return {
  apply(ctx) {
    const slots = ctx.get('slots')

    /* ==================== 样式(规格 §2/§3/§6) ==================== */
    const css = `
.jq-root{--bg-page:var(--dsw-alias-bg-layer-1,#F7F8FA);--bg-card:var(--dsw-alias-bg-layer-2,#FFFFFF);
--bg-subtle:#F2F4F7;--bg-inset:#FAFBFC;--border-l1:var(--dsw-alias-border-l1,#E5E7EB);--border-l2:var(--dsw-alias-border-l2,#EEF0F3);
--text-primary:var(--dsw-alias-label-primary,#1F2329);--text-secondary:var(--dsw-alias-label-secondary,#6B7280);--text-tertiary:#9CA3AF;
--brand:var(--dsw-alias-brand-primary,#2563EB);--brand-hover:#1D4ED8;--brand-bg:#EFF4FF;
--success:var(--dsw-alias-state-success-primary,#16A34A);--success-bg:#E8F7EE;
--warn:var(--dsw-alias-state-warn-primary,#D97706);--error:var(--dsw-alias-state-error-primary,#DC2626);--error-bg:#FDECEC;
--star:#F59E0B;--shadow-card:0 1px 2px rgba(16,24,40,.05);--switch-off:#C9CED6;
--font-ui:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
--font-mono:"SF Mono","JetBrains Mono",Consolas,"Courier New",monospace;
box-sizing:border-box;font-family:var(--font-ui);color:var(--text-primary);max-width:760px;margin:0 auto;}
.jq-root *{box-sizing:border-box}
@media (prefers-color-scheme:dark){.jq-root:not([data-theme=light]){--bg-page:#14161A;--bg-card:#1C1F26;--bg-subtle:#262A33;--bg-inset:#181B21;
--border-l1:#333845;--border-l2:#2A2E39;--text-primary:#E8EAF0;--text-secondary:#9AA2AE;--text-tertiary:#6B7280;
--brand:#5B8DEF;--brand-hover:#7AA3F2;--brand-bg:#22304A;--success:#3FB97F;--success-bg:#1C3A2D;--warn:#E0A040;--error:#E56363;--error-bg:#402222;
--star:#F0B45A;--shadow-card:0 1px 2px rgba(0,0,0,.3);--switch-off:#3A4050}}
.jq-root[data-theme=dark]{--bg-page:#14161A;--bg-card:#1C1F26;--bg-subtle:#262A33;--bg-inset:#181B21;
--border-l1:#333845;--border-l2:#2A2E39;--text-primary:#E8EAF0;--text-secondary:#9AA2AE;--text-tertiary:#6B7280;
--brand:#5B8DEF;--brand-hover:#7AA3F2;--brand-bg:#22304A;--success:#3FB97F;--success-bg:#1C3A2D;--warn:#E0A040;--error:#E56363;--error-bg:#402222;
--star:#F0B45A;--shadow-card:0 1px 2px rgba(0,0,0,.3);--switch-off:#3A4050}
.jq-title{font-size:20px;font-weight:600;line-height:1.6;display:flex;align-items:center;gap:10px}
.jq-title .jq-sub{font-size:12px;color:var(--text-tertiary);font-weight:400}
.jq-theme-btn{margin-left:auto;background:var(--bg-card);border:1px solid var(--border-l1);border-radius:6px;height:24px;padding:0 10px;font-size:12px;color:var(--text-secondary);cursor:pointer}
.jq-theme-btn:hover{border-color:var(--brand);color:var(--brand)}
.jq-card{background:var(--bg-card);border:1px solid var(--border-l1);border-radius:10px;box-shadow:var(--shadow-card);padding:20px;margin-bottom:16px}
.jq-card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.jq-card-title{font-size:16px;font-weight:600}
.jq-tag{font-size:11px;color:var(--text-tertiary)}
.jq-corner{margin-left:auto;font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary)}
.jq-status-line{display:flex;align-items:center;gap:12px;font-size:14px;font-weight:600;margin-bottom:10px}
.jq-dot{width:9px;height:9px;border-radius:50%;background:var(--success);box-shadow:0 0 0 3px var(--success-bg);display:inline-block}
.jq-badge{height:22px;padding:0 8px;border-radius:999px;font-size:12px;display:inline-flex;align-items:center;gap:4px;font-weight:400}
.jq-badge-success{color:var(--success);background:var(--success-bg)}
.jq-badge-subtle{color:var(--text-secondary);background:var(--bg-subtle)}
.jq-info-line{font-size:12px;color:var(--text-secondary)}
.jq-info-line b{color:var(--text-primary);font-weight:600}
.jq-providers{font-size:12px;color:var(--text-secondary);margin-bottom:8px}
.jq-chip{font-family:var(--font-mono);font-size:11px;background:var(--bg-subtle);padding:1px 6px;border-radius:4px;margin-right:4px;color:var(--text-secondary)}
.jq-model-row{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:6px;font-size:13px;cursor:pointer}
.jq-model-row:hover{background:var(--bg-subtle)}
.jq-model-name{font-family:var(--font-mono);font-size:12px;color:var(--text-primary);flex:0 0 auto}
.jq-model-prov{font-size:11px;color:var(--text-tertiary);flex:0 0 auto}
.jq-model-cost{font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary);flex:0 0 auto}
.jq-star{color:var(--star)}
.jq-key{font-size:12px;color:var(--success);margin-left:auto;flex:0 0 auto}
.jq-key-missing{color:var(--error)}
.jq-switch{width:36px;height:20px;border-radius:999px;background:var(--switch-off);position:relative;transition:background .2s;flex:0 0 auto;cursor:pointer;border:none;padding:0}
.jq-switch.jq-on{background:var(--brand)}
.jq-switch .jq-knob{width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:left .2s}
.jq-switch.jq-on .jq-knob{left:18px}
.jq-section-title{font-size:12px;font-weight:600;color:var(--text-secondary);margin:10px 0 6px}
.jq-row{border-top:1px solid var(--border-l2);padding:10px 0;display:flex;align-items:flex-start;gap:16px}
.jq-label{flex:0 0 150px;font-size:13px;line-height:30px}
.jq-hint{font-size:11px;color:var(--text-tertiary);line-height:1.5;padding-top:2px}
.jq-chip-route{height:28px;padding:0 10px;border-radius:6px;font-family:var(--font-mono);font-size:12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid var(--border-l1);background:var(--bg-card);color:var(--text-secondary);margin:0 8px 8px 0}
.jq-chip-route.jq-on{border-color:var(--brand);background:var(--brand-bg);color:var(--brand)}
.jq-input{width:88px;height:30px;border-radius:6px;padding:0 10px;font-family:var(--font-mono);font-size:13px;border:1px solid var(--border-l1);background:var(--bg-card);color:var(--text-primary)}
.jq-input:focus{outline:none;border-color:var(--brand)}
.jq-input.jq-invalid{border-color:var(--error);background:var(--error-bg)}
.jq-range{font-size:10px;color:var(--text-tertiary);margin-top:2px}
.jq-btn{height:30px;padding:0 14px;border-radius:6px;font-size:12px;cursor:pointer}
.jq-btn-primary{background:var(--brand);color:#fff;border:none}
.jq-btn-primary:hover{background:var(--brand-hover)}
.jq-btn-ghost{background:var(--bg-card);border:1px solid var(--border-l1);color:var(--text-secondary)}
.jq-btn-ghost:hover{border-color:var(--brand);color:var(--brand)}
.jq-btn-soft{background:var(--brand-bg);border:1px solid var(--border-l1);color:var(--brand)}
.jq-btn-soft:hover{border-color:var(--brand);color:var(--brand-hover)}
.jq-btn-row{margin-top:12px;display:flex;gap:8px}
.jq-toast{border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:10px;border:1px solid transparent}
.jq-toast-ok{color:var(--success);background:var(--success-bg);border-color:var(--success)}
.jq-toast-err{color:var(--error);background:var(--error-bg);border-color:var(--error)}
.jq-log-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.jq-select{height:28px;border-radius:6px;border:1px solid var(--border-l1);background:var(--bg-card);color:var(--text-primary);font-size:12px;padding:0 6px}
.jq-log-box{background:var(--bg-inset);border:1px solid var(--border-l2);border-radius:6px;padding:10px 12px;max-height:220px;overflow-y:auto;font-family:var(--font-mono);font-size:11.5px;line-height:1.9}
.jq-log-line{display:flex;gap:10px;white-space:nowrap}
.jq-log-time{color:var(--text-tertiary);flex:0 0 52px}
.jq-log-level{flex:0 0 40px;font-weight:600}
.jq-log-level-info{color:var(--brand)}.jq-log-level-warn{color:var(--warn)}.jq-log-level-error{color:var(--error)}
.jq-log-event{flex:0 0 90px;color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis}
.jq-log-detail{color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;flex:1}
.jq-placeholder{padding:16px;text-align:center;font-size:12px;color:var(--text-tertiary)}
.jq-route-node{display:flex;align-items:center;gap:12px;padding:0 12px;height:34px;border:1px solid var(--border-l1);border-radius:6px;margin-bottom:8px;font-family:var(--font-mono);font-size:12px;cursor:grab;background:var(--bg-card);transition:transform .22s ease,opacity .22s ease,border-color .15s ease,box-shadow .22s ease}
.jq-route-node:hover{border-color:var(--brand)}
.jq-route-node.jq-dragging{opacity:.45;border-color:var(--brand);cursor:grabbing;box-shadow:0 6px 16px rgba(16,24,40,.18);transform:scale(1.02);z-index:2}
.jq-route-node.jq-drag-over{border-color:var(--brand);border-style:dashed;background:var(--brand-bg)}
.jq-route-handle{color:var(--text-tertiary);margin-left:auto;flex:0 0 auto;font-size:14px;cursor:grab;user-select:none}
.jq-route-num{width:16px;height:16px;border-radius:50%;background:var(--brand);color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
.jq-route-num-off{background:var(--text-tertiary)}
.jq-route-off{opacity:.45;text-decoration:line-through}
.jq-route-arrow{text-align:center;color:var(--text-tertiary);font-size:12px;line-height:1;margin:-4px 0 4px}
.jq-route-note{font-size:11px;color:var(--text-tertiary);margin-top:8px}
.jq-runbar{display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border-l1);border-radius:6px;height:36px;padding:0 14px;margin-bottom:16px;font-size:12px;color:var(--text-secondary)}
.jq-runbar .jq-dot{margin:0 4px}
.jq-runbar .jq-btn{margin-left:auto;height:24px;padding:0 10px}
.jq-foot{position:fixed;right:16px;bottom:16px;padding:8px 12px;font-size:11px;color:var(--text-tertiary);background:var(--bg-card);border:1px solid var(--border-l1);border-radius:6px;box-shadow:var(--shadow-card)}
.jq-loading{padding:40px 0;text-align:center;font-size:13px;color:var(--text-tertiary)}
.jq-error-box{background:var(--error-bg);border:1px solid var(--error);color:var(--error);border-radius:8px;padding:12px 14px;font-size:13px;margin-bottom:16px}
.jq-error-box .jq-btn{margin-top:10px}
`
    styles.insert(css)

    /* ==================== 工具函数 ==================== */
    function fmtTime(ts) {
      if (!ts) return '—'
      const d = new Date(ts)
      const p = (n) => String(n).padStart(2, '0')
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    }
    function fmtCost(cost) {
      if (!cost) return '价格未知'
      return '$' + cost.input.toFixed(2) + '/$' + cost.output.toFixed(2)
    }
    function routeKey(provider, model) {
      return String(provider) + '|' + String(model)
    }

    /* ==================== F5 日志卡 ==================== */
    function LogCard(props) {
      const [level, setLevel] = React.useState('all')
      const [logs, setLogs] = React.useState(props.state ? props.state.logs : [])
      React.useEffect(() => {
        setLogs(props.state ? props.state.logs : [])
      }, [props.state])
      const refresh = () => {
        props.call('jingqing/panel/logs', { limit: 100, level })
          .then((res) => {
            if (res && Array.isArray(res.logs)) setLogs(res.logs)
          })
          .catch(() => {})
      }
      React.useEffect(() => {
        refresh() // eslint-disable-line react-hooks/exhaustive-deps
      }, [level])
      const rows = logs.map((e, i) => React.createElement('div', { key: i, className: 'jq-log-line' },
        React.createElement('span', { className: 'jq-log-time' }, String(e.t || '').slice(11, 19)),
        React.createElement('span', { className: 'jq-log-level jq-log-level-' + (e.level || 'info') }, String(e.level || '').padEnd(5, ' ')),
        React.createElement('span', { className: 'jq-log-event' }, String(e.event || '')),
        React.createElement('span', { className: 'jq-log-detail', title: e.detail }, String(e.detail || '')),
      ))
      return React.createElement('div', { className: 'jq-card' },
        React.createElement('div', { className: 'jq-card-head' },
          React.createElement('span', { className: 'jq-card-title' }, '日志'),
          React.createElement('span', { className: 'jq-tag' }, '只读'),
          React.createElement('span', { className: 'jq-corner' }, 'F5 · panel/logs'),
        ),
        React.createElement('div', { className: 'jq-log-toolbar' },
          React.createElement('select', { className: 'jq-select', value: level, onChange: (e) => setLevel(e.target.value) },
            React.createElement('option', { value: 'all' }, '全部'),
            React.createElement('option', { value: 'info' }, 'info'),
            React.createElement('option', { value: 'warn' }, 'warn'),
            React.createElement('option', { value: 'error' }, 'error'),
          ),
          React.createElement('button', { className: 'jq-btn jq-btn-ghost', onClick: refresh }, '刷新'),
          React.createElement('span', { className: 'jq-corner', style: { marginLeft: 'auto' } },
            '最近 300 条中的 ' + logs.length + ' 条'),
        ),
        logs.length === 0
          ? React.createElement('div', { className: 'jq-placeholder' }, '暂无日志')
          : React.createElement('div', { className: 'jq-log-box' }, rows),
      )
    }

    /* ==================== F4 配置卡 ==================== */
    function ConfigCard(props) {
      const { state, call, onState } = props
      const config = (state && state.config) || {}
      const [timeoutMs, setTimeoutMs] = React.useState(String(config.timeoutMs || 20000))
      const [maxTokens, setMaxTokens] = React.useState(String(config.maxTokens || 512))
      const [temperature, setTemperature] = React.useState(String(config.temperature != null ? config.temperature : 0.2))
      const [toast, setToast] = React.useState(null) // {kind:'ok'|'err', text}
      React.useEffect(() => {
        setTimeoutMs(String(config.timeoutMs != null ? config.timeoutMs : 20000))
        setMaxTokens(String(config.maxTokens != null ? config.maxTokens : 512))
        setTemperature(String(config.temperature != null ? config.temperature : 0.2))
      }, [state])

      const toastTimer = React.useRef(null)
      const showToast = (kind, text) => {
        setToast({ kind, text })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), kind === 'ok' ? 2500 : 4000)
      }

      const update = (patch) => {
        call('jingqing/panel/update', { patch })
          .then((res) => {
            if (res && res.error) {
              showToast('err', res.error)
              return
            }
            if (res && res.state) onState(res.state)
            showToast('ok', '已生效')
          })
          .catch((e) => showToast('err', String(e && e.message ? e.message : e)))
      }

      const toggleEnabled = () => update({ enabled: !config.enabled })
      const commitNum = (field, value) => {
        const num = Number(value)
        if (value.trim() === '' || Number.isNaN(num)) {
          if (value.trim() === '') {
            if (field === 'timeoutMs') setTimeoutMs(String(config.timeoutMs != null ? config.timeoutMs : 20000))
            if (field === 'maxTokens') setMaxTokens(String(config.maxTokens != null ? config.maxTokens : 512))
            if (field === 'temperature') setTemperature(String(config.temperature != null ? config.temperature : 0.2))
          }
          return
        }
        const patch = {}
        patch[field] = num
        update(patch)
      }

      return React.createElement('div', { className: 'jq-card' },
        React.createElement('div', { className: 'jq-card-head' },
          React.createElement('span', { className: 'jq-card-title' }, '配置'),
          React.createElement('span', { className: 'jq-tag' }, '可编辑 · 即时生效'),
          React.createElement('span', { className: 'jq-corner' }, 'F4 · panel/update'),
        ),
        toast && React.createElement('div', { className: 'jq-toast jq-toast-' + (toast.kind === 'ok' ? 'ok' : 'err') }, toast.text),
        React.createElement('div', { className: 'jq-row' },
          React.createElement('span', { className: 'jq-label' }, '启用鲸晴识图'),
          React.createElement('button', {
            className: 'jq-switch' + (config.enabled ? ' jq-on' : ''),
            onClick: toggleEnabled,
            role: 'switch',
            'aria-checked': Boolean(config.enabled),
          }, React.createElement('span', { className: 'jq-knob' })),
          React.createElement('div', { className: 'jq-hint' }, '关闭后暂停图片识别自动流程（准入绕过保留）；模型启停请在上方「模型检测结果」中设置'),
        ),
        React.createElement('div', { className: 'jq-row' },
          React.createElement('span', { className: 'jq-label' }, '超时(ms)'),
          React.createElement('div', {},
            React.createElement('input', {
              className: 'jq-input', type: 'number', value: timeoutMs, step: 1,
              onChange: (e) => setTimeoutMs(e.target.value),
              onBlur: (e) => commitNum('timeoutMs', e.target.value),
            }),
            React.createElement('div', { className: 'jq-range' }, '1000–60000'),
          ),
        ),
        React.createElement('div', { className: 'jq-row' },
          React.createElement('span', { className: 'jq-label' }, '输出上限(token)'),
          React.createElement('div', {},
            React.createElement('input', {
              className: 'jq-input', type: 'number', value: maxTokens, step: 1,
              onChange: (e) => setMaxTokens(e.target.value),
              onBlur: (e) => commitNum('maxTokens', e.target.value),
            }),
            React.createElement('div', { className: 'jq-range' }, '64–4096'),
          ),
        ),
        React.createElement('div', { className: 'jq-row' },
          React.createElement('span', { className: 'jq-label' }, '温度'),
          React.createElement('div', {},
            React.createElement('input', {
              className: 'jq-input', type: 'number', value: temperature, step: 0.05,
              onChange: (e) => setTemperature(e.target.value),
              onBlur: (e) => commitNum('temperature', e.target.value),
            }),
            React.createElement('div', { className: 'jq-range' }, '0–2 · 步进 0.05'),
          ),
        ),
        React.createElement('div', { className: 'jq-btn-row' },
          React.createElement('button', {
            className: 'jq-btn jq-btn-ghost',
            onClick: () => {
              call('jingqing/panel/reset', {}).then((res) => {
                if (res && res.state) onState(res.state)
                showToast('ok', '已恢复默认配置')
              }).catch(() => {})
            },
          }, '恢复默认'),
        ),
      )
    }

    /* ==================== F3 识图路由卡（v7.3.0：可拖拽排序 + 价格 + FLIP 动画） ==================== */
    function RouteCard(props) {
      const { state, call, onState } = props
      const routes = (state && state.routes) || []
      const routeOrder = (state && state.config && state.config.routeOrder) || []
      const [dragKey, setDragKey] = React.useState(null)
      const [overKey, setOverKey] = React.useState(null) // 当前悬停目标（虚线高亮）
      const [localRoutes, setLocalRoutes] = React.useState(null) // 拖拽中的临时顺序
      const overKeyRef = React.useRef(null)
      const rowRefs = React.useRef({}) // key -> DOM 元素（FLIP 测量用）
      const prevTops = React.useRef({}) // key -> 上次 offsetTop（FLIP First 帧）
      const list = localRoutes || routes
      const keyOf = (r) => routeKey(r.provider, r.id)
      // state 变化（提交成功/启停/重扫）后丢弃本地拖拽态
      React.useEffect(() => {
        setLocalRoutes(null); setDragKey(null); setOverKey(null); overKeyRef.current = null
        prevTops.current = {}
      }, [state])
      // FLIP 让位动画：重排后从旧位置平滑滑动到新位置
      React.useEffect(() => {
        const tops = {}
        for (const key of Object.keys(rowRefs.current)) {
          const el = rowRefs.current[key]
          if (el) tops[key] = el.offsetTop
        }
        for (const key of Object.keys(tops)) {
          const prev = prevTops.current[key]
          if (prev === undefined || prev === tops[key]) continue
          const el = rowRefs.current[key]
          const dy = prev - tops[key]
          el.style.transition = 'none'
          el.style.transform = 'translateY(' + dy + 'px)'
          void el.offsetHeight // 强制 reflow，让位移先生效
          el.style.transition = 'transform .22s ease'
          el.style.transform = 'translateY(0)'
        }
        prevTops.current = tops
      }, [list])
      const commitOrder = (ordered) => {
        call('jingqing/panel/update', { patch: { routeOrder: ordered.map(keyOf) } })
          .then((res) => { if (res && res.state) onState(res.state); setLocalRoutes(null) })
          .catch(() => setLocalRoutes(null))
      }
      const onDragStart = (e, key) => {
        setDragKey(key)
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', key) } catch (_) {}
      }
      const onDragOver = (e, key) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!dragKey || dragKey === key || overKeyRef.current === key) return
        overKeyRef.current = key
        setOverKey(key)
        const from = list.findIndex((r) => keyOf(r) === dragKey)
        const to = list.findIndex((r) => keyOf(r) === key)
        if (from < 0 || to < 0) return
        const next = list.slice()
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        setLocalRoutes(next)
      }
      const onDrop = (e) => { e.preventDefault(); overKeyRef.current = null; setOverKey(null) }
      const onDragEnd = () => {
        overKeyRef.current = null
        setDragKey(null)
        setOverKey(null)
        if (localRoutes && localRoutes !== routes) commitOrder(localRoutes)
        else setLocalRoutes(null)
      }
      const manual = Array.isArray(routeOrder) && routeOrder.length > 0
      const nodes = list.map((r, i) => {
        const key = keyOf(r)
        return React.createElement(React.Fragment, { key },
          i > 0 && React.createElement('div', { className: 'jq-route-arrow' }, '↓'),
          React.createElement('div', {
            className: 'jq-route-node' +
              (dragKey === key ? ' jq-dragging' : '') +
              (overKey === key && dragKey !== key ? ' jq-drag-over' : ''),
            draggable: true,
            ref: (el) => { if (el) rowRefs.current[key] = el },
            onDragStart: (e) => onDragStart(e, key),
            onDragOver: (e) => onDragOver(e, key),
            onDrop,
            onDragEnd,
            title: '拖动调整调用顺序',
          },
            React.createElement('span', { className: 'jq-route-num' }, String(i + 1)),
            React.createElement('span', { className: 'jq-model-name' }, r.id),
            React.createElement('span', { className: 'jq-model-prov' }, r.provider),
            React.createElement('span', { className: 'jq-model-cost' }, fmtCost(r.cost)),
            React.createElement('span', { className: 'jq-route-handle' }, '⠿'),
          ),
        )
      })
      return React.createElement('div', { className: 'jq-card' },
        React.createElement('div', { className: 'jq-card-head' },
          React.createElement('span', { className: 'jq-card-title' }, '识图路由'),
          React.createElement('span', { className: 'jq-tag' }, manual ? '手动排序 · 拖动调整' : '按性价比自动排序 · 可拖动调整'),
          React.createElement('span', { className: 'jq-corner' }, 'F3 · routes'),
        ),
        routes.length === 0
          ? React.createElement('div', { className: 'jq-placeholder' }, '没有激活的路由（模型未启用或已停用）')
          : nodes,
        React.createElement('div', { className: 'jq-route-note' },
          '拖动行调整调用顺序（调用失败时按顺序回退）；未手动排序时按性价比自动排列；' +
          '启停请在「模型检测结果」中设置'),
      )
    }

    /* ==================== F2 模型检测结果卡 ==================== */
    function ModelsCard(props) {
      const { state, call, onState } = props
      const scan = (state && state.scan) || {}
      const recommended = (state && state.recommended) || []
      const vision = scan.visionModels || []
      const routesEnabled = (state && state.config && state.config.routesEnabled) || {}
      const recSet = new Set(recommended)

      const toggle = (v) => {
        const key = routeKey(v.provider, v.id)
        const patch = {}
        patch[key] = !(routesEnabled[key] !== false)
        call('jingqing/panel/update', { patch: { routesEnabled: patch } })
          .then((res) => { if (res && res.state) onState(res.state) })
          .catch(() => {})
      }
      const rescan = () => {
        call('jingqing/panel/rescan', {})
          .then((res) => { if (res && res.state) onState(res.state) })
          .catch(() => {})
      }

      const rows = vision.map((v) => {
        const key = routeKey(v.provider, v.id)
        const on = routesEnabled[key] !== false
        const cred = v.credential || {}
        const isRec = recSet.has(v.provider + '/' + v.id)
        return React.createElement('div', {
          key: key,
          className: 'jq-model-row',
          onClick: () => toggle(v),
          title: '点击' + (on ? '停用' : '启用') + ' ' + v.provider + '/' + v.id,
        },
          React.createElement('button', {
            className: 'jq-switch' + (on ? ' jq-on' : ''),
            onClick: (e) => { e.stopPropagation(); toggle(v) },
          }, React.createElement('span', { className: 'jq-knob' })),
          isRec && React.createElement('span', { className: 'jq-star' }, '★'),
          React.createElement('span', { className: 'jq-model-name' }, v.id),
          React.createElement('span', { className: 'jq-model-prov' }, v.provider),
          cred.configured
            ? React.createElement('span', { className: 'jq-key' }, 'Key:已配置 ✅')
            : React.createElement('span', { className: 'jq-key jq-key-missing' }, 'Key:未配置 ❌'),
        )
      })

      return React.createElement('div', { className: 'jq-card' },
        React.createElement('div', { className: 'jq-card-head' },
          React.createElement('span', { className: 'jq-card-title' }, '模型检测结果'),
          React.createElement('span', { className: 'jq-tag' }, '全部已配置的识图模型 · 可启停'),
          React.createElement('span', { className: 'jq-corner' }, 'F2 · scan'),
        ),
        React.createElement('div', { className: 'jq-providers' },
          '提供方:', (scan.providers || []).map((p) => React.createElement('span', { key: p, className: 'jq-chip' }, p)),
        ),
        React.createElement('div', { className: 'jq-section-title' }, '识别模型（按性价比排序，★=当前推荐；开关为唯一启停入口）'),
        vision.length === 0
          ? React.createElement('div', { className: 'jq-placeholder' }, '未扫描到支持识图功能的模型')
          : rows,
        React.createElement('div', { className: 'jq-btn-row' },
          React.createElement('button', { className: 'jq-btn jq-btn-soft', onClick: rescan }, '🔄 立即重扫'),
        ),
      )
    }

    /* ==================== F1 状态总览卡 ==================== */
    function StatusCard(props) {
      const { state } = props
      const scan = (state && state.scan) || {}
      const runtime = (state && state.runtime) || {}
      const adm = Array.isArray(runtime.admissionView) ? runtime.admissionView.join(' + ') : '未知'
      return React.createElement('div', { className: 'jq-card' },
        React.createElement('div', { className: 'jq-card-head' },
          React.createElement('span', { className: 'jq-card-title' }, '状态总览'),
          React.createElement('span', { className: 'jq-tag' }, '只读'),
          React.createElement('span', { className: 'jq-corner' }, 'F1 · panel/state'),
        ),
        React.createElement('div', { className: 'jq-status-line' },
          React.createElement('span', { className: 'jq-dot' }),
          React.createElement('span', null, '运行中 · ' + ((state && state.version) || 'v1.0.0')),
          runtime.wrapActive
            ? React.createElement('span', { className: 'jq-badge jq-badge-success' }, '准入绕过:生效 ✅')
            : React.createElement('span', { className: 'jq-badge jq-badge-subtle' }, '准入绕过:未生效'),
          React.createElement('span', { className: 'jq-badge jq-badge-subtle' }, 'admission: ' + adm),
        ),
        React.createElement('div', { className: 'jq-info-line' },
          '上次扫描:', ' ',
          React.createElement('b', null, fmtTime(scan.scannedAt)),
          ' · ', React.createElement('b', null, String((scan.providers || []).length)), ' 个提供方 · ',
          React.createElement('b', null, String((scan.visionModels || []).length)), ' 个识图模型',
          '（重扫仅由手动触发）',
        ),
      )
    }

    /* ==================== F7 运行卡片状态条 ==================== */
    function RunBar(props) {
      const { state, onOpen } = props
      const n = (state && state.scan && state.scan.visionModels) || []
      const rec = (state && state.recommended && state.recommended[0]) || ''
      const ok = (state && state.guidance && state.guidance.hasVisionModel) !== false
      return React.createElement('div', { className: 'jq-runbar' },
        React.createElement('span', { className: 'jq-dot', style: ok ? {} : { background: 'var(--warn)', boxShadow: '0 0 0 3px var(--success-bg)' } }),
        React.createElement('span', null,
          '鲸晴 ' + ((state && state.version) || 'v7') + ' · ' +
          (ok ? ('识图就绪（' + n.length + ' 模型 · 推荐 ' + rec + '）') : '未检测到可用识图模型')),
        React.createElement('button', { className: 'jq-btn jq-btn-ghost', onClick: onOpen }, '设置'),
      )
    }

    /* ==================== 设置页主组件 ==================== */
    function Panel(props) {
      const { call } = props
      const [state, setState] = React.useState(null)
      const [phase, setPhase] = React.useState('loading') // 'loading' | 'ready' | 'error'
      const [error, setError] = React.useState(null)
      const [theme, setTheme] = React.useState(null) // null=跟随系统,'light'|'dark'
      const load = React.useCallback(() => {
        setPhase('loading')
        setError(null)
        call('jingqing/panel/state', {})
          .then((res) => {
            if (res && res.error) throw new Error(res.error)
            setState(res && res.state ? res.state : res)
            setPhase('ready')
          })
          .catch((e) => { setError(String(e && e.message ? e.message : e)); setPhase('error') })
      }, [call])
      React.useEffect(() => { load() }, [load])
      if (phase === 'loading') {
        return React.createElement('div', { className: 'jq-root' },
          React.createElement('div', { className: 'jq-card' },
            React.createElement('div', { className: 'jq-loading' }, '鲸晴面板加载中…'),
          ),
        )
      }
      if (phase === 'error') {
        return React.createElement('div', { className: 'jq-root' },
          React.createElement('div', { className: 'jq-title' }, '鲸晴',
            React.createElement('span', { className: 'jq-sub' }, 'MiMo 识图增强'),
          ),
          React.createElement('div', { className: 'jq-error-box' },
            React.createElement('div', null, '面板加载失败：' + error),
            React.createElement('button', { className: 'jq-btn jq-btn-primary', onClick: load }, '重试'),
          ),
        )
      }
      const themeAttr = theme || undefined
      return React.createElement('div', {
        className: 'jq-root',
        'data-theme': themeAttr,
      },
        React.createElement('div', { className: 'jq-title' },
          React.createElement('span', null, '鲸晴'),
          React.createElement('span', { className: 'jq-sub' }, 'MiMo 识图增强 · ' + ((state && state.version) || 'v7')),
          React.createElement('button', {
            className: 'jq-theme-btn',
            onClick: () => setTheme(theme === 'dark' ? 'light' : (theme === 'light' ? null : 'dark')),
          }, theme === 'dark' ? '☀️ 浅色' : '🌙 深色'),
        ),
        React.createElement(RunBar, { state, onOpen: () => {} }),
        React.createElement(StatusCard, { state }),
        React.createElement(ModelsCard, { state, call, onState: setState }),
        React.createElement(RouteCard, { state, call, onState: setState }),
        React.createElement(ConfigCard, { state, call, onState: setState }),
        React.createElement(LogCard, { state, call }),
        React.createElement('div', { className: 'jq-foot' }, '鲸晴 · 风格A简约 · panel/state'),
      )
    }

    /* ==================== 运行卡片状态区(tool.view.cordis, key=self) ==================== */
    function RunCard(props) {
      const [state, setState] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        host.call('jingqing/panel/state', {})
          .then((res) => { if (alive && res && res.state) setState(res.state) })
          .catch(() => {})
        return () => { alive = false }
      }, [])
      const n = (state && state.scan && state.scan.visionModels) || []
      const rec = (state && state.recommended && state.recommended[0]) || ''
      const ok = (state && state.guidance && state.guidance.hasVisionModel) !== false
      return React.createElement('div', { className: 'jq-root', style: { maxWidth: 'none', margin: 0 } },
        React.createElement('div', { className: 'jq-runbar', style: { marginBottom: 0 } },
          React.createElement('span', { className: 'jq-dot', style: ok ? {} : { background: 'var(--warn)' } }),
          React.createElement('span', null,
            '鲸晴 ' + ((state && state.version) || 'v7') + ' · ' +
            (ok ? ('识图就绪（' + n.length + ' 模型 · 推荐 ' + rec + '）') : '未检测到可用识图模型')),
        ),
      )
    }

    /* ==================== 注册 ==================== */
    // 主入口：设置页（规格 §4.1）
    if (slots) {
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'jingqing', order: 25, label: '鲸晴' },
        (props) => React.createElement(Panel, { call: host.call, close: props && props.close }),
      ))
      // 辅入口：运行卡片状态区（规格 §4.3）
      slots.inject('tool.view.cordis', () => slots.register(
        { name: 'tool.view.cordis', key: 'self' },
        (props) => React.createElement(RunCard, { call: host.call }),
      ))
    }
  },
}

========== [CLIENT 源码] 结束 ==========
