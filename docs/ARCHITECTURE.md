# 鲸晴 · 架构说明

## 1. 总体数据流

```
┌────────────────────────────────────────────────────────────────────┐
│                        DeepSeek Harness Host                       │
│                                                                    │
│  ┌──────────────┐   respond 准入    ┌──────────────────────────┐  │
│  │  用户 Web UI  │ ─────────────────▶│  dsh-host-apiproxy      │  │
│  │ （上传图片）   │                    │  MODEL_DOES_NOT_SUPPORT_ │  │
│  └──────────────┘                    │  IMAGES 检查            │  │
│                                      └───────────┬──────────────┘  │
│                                                  │ llm.resolveModelInfo
│                                                  ▼                  │
│                                     ┌──────────────────────────┐  │
│                                     │  [3] AdmissionBypass     │  │
│                                     │  （进程级幂等包装，上报   │  │
│                                     │   image 模态）            │  │
│                                     └───────────┬──────────────┘  │
│                                                 ▼                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  agent-loop：user/message 进入 inbox → agent/pre-step 瀑布  │  │
│  │   ┌─────────────────────────────────────────────────────┐  │  │
│  │   │ [5] ImageInterceptor（本插件监听器）                │  │  │
│  │   │  图片 + 模型原生不支持看图？                        │  │  │
│  │   │   ├─ [2] ModelDetector 判定有识图模型               │  │  │
│  │   │   │    → 注入识图指令 notice（可折叠上下文行）       │  │  │
│  │   │   └─ 无识图模型                                    │  │  │
│  │   │        → 注入 [4] Guidance 配置引导 notice          │  │  │
│  │   └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────┬──────────────────────────────┘  │
│                                  ▼                                 │
│   模型请求（消息含 notice 指令，图片块由适配器降级为占位文本）        │
│                                  │                                 │
│                                  ▼                                 │
│   模型调用工具 jingqing_describe_image（工具卡片展示在思维链）        │
│   ┌────────────────────────────────────────────────────────────┐  │
│   │ [6] DescribeTool.execute                                  │  │
│   │  ├─ resolveImageRef：会话日志按 attachmentId 解析图片引用   │  │
│   │  ├─ attachments.readImage：校验可读                        │  │
│   │  ├─ pickRoutes()：动态路由（推荐 → 兜底）                  │  │
│   │  └─ callVisionRoute：llm.stream 流式收集（超时/取消）      │  │
│   └────────────────────────────────────────────────────────────┘  │
│                                  │                                 │
│                                  ▼                                 │
│   工具结果（MiMo 识图描述）→ 模型继续推理 → 最终回答                │
└────────────────────────────────────────────────────────────────────┘
```

## 2. 模块职责

| 模块 | 关键函数 | 职责与设计要点 |
| --- | --- | --- |
| `[0] Config` | 常量 | 推荐路由、成本表、超时、token 上限、温度；PanelConfig 运行时配置（enabled/逐模型启停/routeOrder 手动排序/参数），修改即时生效 |
| `[1] Logger` | `log()` | 环形缓冲（上限 `LOG_LIMIT`）+ console；`jingqing/panel/logs` RPC 读取 |
| `[2] ModelDetector` | `scan()` / `pickRoutesInfo()` / `hasVisionModel()` / `detectGuidanceReason()` | 首次激活即扫；`llm.listProviders` → `llm.listModels` → `inputModalities` 过滤；`settings.get('llm-pi-ai')` + `credentials.describe` 探测 Key 配置；**v7.2 起仅首次自动 + 手动重扫**（不再监听事件自动重扫）；单点失败容错记录 `errors` |
| `[3] AdmissionBypass` | 包装 `llm.resolveModelInfo` | 进程级、幂等（标记 `__jingqing_modality_wrap`）；原始模态入 `originals` 映射；**不注册 fiber effect**（HMR 重载会触发清理导致失效——v4 踩坑） |
| `[4] Guidance` | `guidanceText()` / `makeGuidanceNotice()` | 无识图模型时的用户引导；推荐 mimoV2.5 与性价比；按原因（missing-provider / missing-credential / no-vision）给出差异化步骤 |
| `[5] ImageInterceptor` | `collectImages()` / `makeInstructionNotice()` / pre-step 监听 | `agent/pre-step` 瀑布：先 `next()` 取默认决策再追加 notice；仅当图片 + 模型原生不支持看图时注入；有模型 → 指令，无模型 → 引导 |
| `[6] DescribeTool` | `resolveImageRef()` / `callVisionRoute()` / `execute()` | 工具 schema 遵循 harness DSL（`harness.defineTool`）；多路由降级（按 `routeOrder` 手动顺序或性价比序）；超时/取消用 exec.signal 透传 + 循环耗时检查（沙箱无 AbortController——v5 踩坑） |
| `[7] DiagTool` | `jingqing_diag` | 报告扫描快照、包装状态、引导判定、动态路由、生命周期计数（v7.2.1+），供排障 |
| `[8] PanelRpc` | `jingqing/panel/{state|update|rescan|logs|reset}` | 面板数据读写；`routeOrder` 手动排序提交；`reset` 恢复默认 |

## 3. 关键设计决策

### 3.1 为什么包装 `llm.resolveModelInfo` 而不是改准入代码
Host 图片准入（`dsh-host-apiproxy` respond 路径）硬编码调用 `llm.resolveModelInfo`
检查 `inputModalities`，无图片模态即返回 `MODEL_DOES_NOT_SUPPORT_IMAGES`。
该检查无事件/瀑布可挂钩，因此采用**运行时方法包装**：对所有模型上报 `image` 模态，
同时把原始模态存入映射，供拦截模块判断"当前模型是否原生看图"（决定是否注入指令）。

### 3.2 为什么准入绕过是进程级且不做还原
cordis fiber 在注入服务（如 timer）的提供方被 HMR 重启时会执行 `_unload()`（触发
全部 effect 清理）→ `_reload()`（重新 apply）。若包装的还原逻辑注册为 fiber effect，
包装会随重载反复失效（v1–v3 实测 `wrapCount` 归零、拦截复发）。v4 起改为进程级
一次性、幂等安装：`llm[__jingqing_modality_wrap]` 存在即跳过，不注册任何还原 effect。

### 3.3 为什么不用 AbortController
动态插件沙箱（`node:vm` 上下文）不提供 `AbortController` 全局。超时/取消改为：
- 把工具 `exec.signal`（Host 侧 AbortSignal）直接透传给 `llm.stream`；
  工具超时策略（`dsh-tool-call-timeout-policy`）会在 `timeoutMs` 后中止该信号，
  适配器随即以 `aborted` finish 结束流；
- 流循环内按块检查 `signal.aborted`（调用方取消）与已耗时（软超时）；
- 提前 `break` 会触发异步迭代器 `return()`，关闭底层请求。

### 3.4 图片为什么不会发给纯文本模型
pi-ai 适配器的 `transformMessages` 对 `model.input` 不含 `image` 的模型自动把图片块
降级为 `(image omitted: model does not support images)` 占位文本——纯文本模型
永远收不到图片字节，只会收到工具返回的识图描述。

### 3.5 作用域：为什么监听器能收到 agent 事件
`agent/pre-step` 是 agent 作用域分发的事件；dsh-scope 的 `scopeTarget` 对**未打
scope 标签**的监听器全局放行。动态插件 fiber 的 ctx 无 scope 标签，因此能收到事件。

## 4. 错误处理矩阵

| 场景 | 处理 |
| --- | --- |
| 某提供方 `listModels` 失败 | 记录 `errors`，继续扫其他提供方 |
| `settings` / `credentials` 不可用 | 凭据探测降级为空，不阻断扫描 |
| 工具附件不存在 | 明确报错并提示以 notice 附件 ID 为准 |
| 首选路由失败 | 依次尝试下一路由（多路由降级），全部失败抛出最后错误 |
| 超时 / 用户取消 | 抛出"识图超时/已取消"；`exec.signal` 链路保证底层请求关闭 |
| 无任何识图路由 | 抛出配置引导错误（携带 mimoV2.5 推荐与配置步骤） |
| pre-step 注入失败 | 记日志并返回默认决策，不阻断对话 |

## 5. 沙箱环境约束（踩坑清单）

| 约束 | 对策 |
| --- | --- |
| 无 `AbortController` | exec.signal 透传 + 循环耗时检查（3.3） |
| 无 `fetch`/`require`/原生定时器 | 只用 `ctx` 服务（llm/attachments/settings/credentials/timer）与 `llm.stream` |
| fiber effect 生命周期陷阱 | 进程级幂等包装，不注册还原 effect（3.2） |
| `ctx` 只读代理 | 服务通过 `ctx.get()` 获取；方法调用经代理转发 |
| 返回值需 JSON 可序列化 | `harness.defineTool` 强制 JSON round-trip，返回仅含标量/数组/对象 |
