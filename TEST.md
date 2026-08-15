# 鲸晴 · 测试计划（v1.0.0）

## 0. 测试环境

| 项 | 值 |
| --- | --- |
| 平台 | Windows，DeepSeek Harness（web profile） |
| 插件版本 | v1.0.0（jingq-1，动态 Cordis 插件） |
| 默认对话模型 | opencode-go / deepseek-v4-flash（纯文本，input: ["text"]） |
| 已配置提供方 | deepseek-official、opencode-go、xiaomi |
| 识图模型（扫描预期） | xiaomi/mimo-v2.5（推荐首选）、opencode-go/mimo-v2.5（推荐备选）、其余 8 个视觉模型兜底 |
| 测试数据 | `test-fixtures/sample.png`（640×420：天空、太阳、草地、苹果、文字） |

## 1. 外部通路验证（前置检查）

```bash
node test-fixtures/verify-mimo.mjs test-fixtures/sample.png "请用中文详细描述这张图片的内容。"
```

- 预期：HTTP 200，返回含太阳/草地/苹果/文字的中文描述
- 实测：✅（约 8.7s）

## 2. 自动化检查点（已执行）

| 检查点 | 方式 | 结果 |
| --- | --- | --- |
| 插件运行状态 | `cordis_inspect_self` | ✅ running（pkg-36，Host+Client，v1.0.0），无诊断错误 |
| 工具注册 | `Tool.listTools` | ✅ `jingqing_describe_image`、`jingqing_diag` schema 正确 |
| **模型自动检测（平铺）** | `jingqing_diag` scan | ✅ ready=true；3 提供方；10 个识图模型平铺（含 cost/score/enabled/credential）；errors=[] |
| **性价比排序** | `jingqing_diag` | ✅ score 升序；同分稳定序生效 |
| **动态推荐** | `jingqing_diag` recommended | ✅ `xiaomi/mimo-v2.5`（性价比最高且为推荐模型） |
| **运行时配置** | `jingqing_diag` config | ✅ enabled=true、routesEnabled 动态键控、routeOrder=[]、timeoutMs=20000、maxTokens=512、temperature=0.2 |
| 准入绕过 | `jingqing_diag` | ✅ wrapperActive=true；admissionView=['text','image']；wouldReject=false |
| **Client 设置页注册** | `Slots.listSubTree(settings.section)` | ✅ occupant `dyn/jingq-1 → id=jingqing, order=25, active` |
| **运行卡片注册** | `Slots.listSubTree(tool.view.cordis)` | ✅ occupant `dyn/jingq-1 → key=jingq-1.pkg-36, active` |
| Client 激活（审批） | `cordis_run` | ✅ 授权后续版本后自动激活，无 client-render 诊断 |
| 外部通路 | `verify-mimo.mjs` | ✅ HTTP 200 |

## 3. 面板用例（需在 GUI 中人工验收）

| ID | 用例 | 预期 |
| --- | --- | --- |
| P1 | 设置 → 侧栏出现"鲸晴"页 | 位于智能体预设之后 |
| P2 | 状态总览卡 | 版本/运行/准入绕过/扫描时间与 diag 一致 |
| P3 | 模型检测卡 | 全部识图模型平铺、★推荐标注、Key 状态、逐模型开关 |
| P4 | 路由卡 | 激活顺序 = 性价比排序；关闭某模型后路由重编号 |
| P5 | 配置总开关 | 关闭后上传图片不再注入 notice；工具报"已停用" |
| P6 | 参数修改 | 非法值红条提示且不生效；合法值绿条提示 |
| P7 | 立即重扫 | 扫描时间戳更新、日志插入 scan 记录 |
| P8 | 日志 | 级别过滤/刷新正确 |
| P9 | 运行卡片徽标 | 显示模型数与推荐 |
| P10 | 深色/浅色切换 | 两种主题可读性正常 |

## 4. 功能用例（Host 侧回归）

### T1 纯文本模型 + 单图（核心路径）
- 步骤：deepseek-v4-flash 会话上传 `sample.png` 发送。
- 预期：① 无"当前模型不支持图片"拦截；② 出现鲸晴可折叠行；③ 思维链出现识图工具
  卡片（可展开查看描述）；④ 模型基于描述回答。
- 判定：1–4 全满足 = 通过。

### T2 图片 + 文字问题
- 预期：notice 携带用户问题（工具 `question` 参数）；最终回答与图片事实一致。

### T3 多图消息
- 预期：notice 列出全部附件 ID；逐张调用工具；无报错。

### T4 模型自动检测与动态路由
- 步骤：激活后调用 `jingqing_diag`。
- 预期：`scan.ready=true`；`visionModels` 包含全部支持图片输入的模型；
  `recommended` 命中 mimo-v2.5 双通道且顺序正确（xiaomi 优先）；`routes` 推荐在前。
- 实测：✅（见第 2 节）。

### T5 凭据状态探测
- 预期：`missingCredentials` 逐提供方报告 `configured`（不泄露 Key 值）。
- 实测：✅。

### T6 无识图模型 → 用户引导流程
- 步骤（需构造无视觉模型环境）：将 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers`
  清空或删除 `xiaomi`/`opencode-go` → 重启 DSH → 重新激活插件 → 上传图片。
- 预期：
  1. `jingqing_diag`：`hasVisionModel=false`；`guidanceReason` 为
     `missing-provider` / `missing-credential` / `no-vision` 之一；
  2. 上传图片后注入**配置引导 notice**（summary："鲸晴：未检测到可用的识图模型，
     展开查看配置引导…"）；展开可见 mimoV2.5 推荐与性价比说明（$0.14/$0.28 每百万
     token）与三步配置步骤；
  3. 模型据此向用户说明如何购买/配置 API。
- 判定：引导 notice 内容完整（推荐 + 性价比 + 步骤）= 通过。

### T7 路由降级
- 步骤：临时使 xiaomi 路由失败（如删除 XIAOMI_API_KEY 后重启，或断网模拟）。
- 预期：`describe-route-failed`（xiaomi）→ 自动尝试 opencode-go/mimo-v2.5 → 仍成功；
  工具结果 `provider=opencode-go`。

### T8 非法附件 ID（容错）
- 预期：工具返回"在会话中找不到附件"明确错误；会话不崩溃。

### T9 超时与取消
- 预期：`MIMO_TIMEOUT_MS` 调小可测软超时；点击停止可测取消；均返回明确错误，
  底层请求被关闭（迭代器 return()）。

### T10 准入绕过在 HMR/fiber 重载后仍有效（回归项）
- 预期：任意 HMR 重载后 `jingqing_diag` 仍报告 `wrapperActive=true`、
  `wouldReject=false`（v4 起进程级幂等，不再受 fiber 生命周期影响）。

### T11 沙箱兼容（回归项）
- 预期：工具执行不依赖 `AbortController`（v5 修复）；`jingqing_diag` 正常输出。

## 4. 引导路径代码级验证（无真实环境时）

`guidanceText(reason)` 为纯函数，可独立审查：

- `missing-provider`：推荐 xiaomi/mimo-v2.5 + 性价比 + "添加提供方 + 写入 Key"步骤
- `missing-credential`：推荐 + "提供方已配置但 Key 缺失"步骤
- `no-vision`：推荐 + "添加支持图片输入的模型"步骤
- 三类文案均含备用通道（opencode-go）与"配置后自动检测启用、无需重启"说明

## 5. 回归风险提示

- DSH 升级若改变 `llm.resolveModelInfo` 签名或准入检查位置，需同步包装逻辑
- pi-ai 目录更新可能改变 `mimo-v2.5` 模型 ID/能力声明，以
  `dist/providers/data/xiaomi.json` 为准（插件扫描为动态结果，自动适配）
- 动态插件随进程存活，重启后需重新激活
