# 变更记录

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-08-15

### 发布说明
**鲸晴 V1.0.0 正式版** —— 自内部迭代 v7.3.1 收敛的稳定发布版。功能与 v7.3.1 一致，
版本号重新编排为语义化版本（1.0.0）。

### 功能总览
- **任意模型可识图**：纯文本对话模型（如 DeepSeek）上传图片不再被准入拦截，
  图片自动交给视觉模型（首选 `xiaomi/mimo-v2.5`）识别，描述交回对话模型继续推理
- **模型自动检测**：首次激活自动扫描已配置提供方/模型与 API Key 状态；之后仅手动重扫
- **手动路由排序**：设置页「识图路由」卡可拖拽调整模型调用顺序（FLIP 让位动画），
  支持逐模型启停；未手动排序时按性价比自动排列
- **Client 配置面板**（风格A简约）：状态总览、模型检测结果、识图路由、配置、日志五卡；
  运行卡片状态徽标；双主题
- **智能引导**：无可用识图模型时自动注入配置引导（推荐 mimoV2.5 + 官方文档链接）
- **思维链透明**：识图过程以可折叠上下文行 + 可展开工具调用卡片呈现

## [7.3.1] - 2026-08-15

### 变更
- **模型检测结果卡(F2)删除价格列**：价格只保留在「识图路由」卡(F3)中，减少信息重复
- **识图路由拖拽动画**：拖拽排序加入 FLIP 让位动画 —
  - 行重排后从旧位置平滑滑动到新位置(220ms ease)
  - 拖动中的行半透明 + 微缩放(1.02)+ 阴影
  - 悬停目标行显示品牌色虚线框 + 浅蓝背景提示落点

## [7.3.0] - 2026-08-15

### 新增
- **手动路由排序**：「识图路由」卡(F3)取消只读设计，改为**可拖拽排序**：
  - 每行显示序号、模型名、提供方与**价格**(输入/输出 $/M，与模型检测结果卡一致)
  - 拖动行实时重排，松手后提交 `config.routeOrder`（provider|model 键数组）并即时生效
  - 未手动排序时按性价比自动排列；`routeOrder` 未覆盖的新模型自动追加末尾
  - 卡片角标随状态显示「手动排序 · 拖动调整」或「按性价比自动排序 · 可拖动调整」
- **PanelConfig 扩展**：新增 `routeOrder` 字段（校验：数组、元素非空字符串、去重；
  未知键忽略）；`panel/state` 返回 `config.routeOrder` 与带 cost/score/enabled 的
  完整路由列表；「恢复默认」将清空手动顺序（回性价比排序）

### 变更
- `pickRoutesInfo()`：路由输出顺序 = 手动 `routeOrder`（若存在）→ 否则性价比；
  识图工具实际调用顺序遵循该顺序（失败时按序回退）

## [7.2.1] - 2026-08-15

### 新增
- **生命周期诊断计数**（临时诊断版，用于定位「每次打开配置页都像需要重新扫描」）：
  - 跨 apply 计数挂在 `llm.__jingqing_meta`（进程级、幂等）：
    `hostApplyCount` / `scanCount` / `panelStateCalls` / `firstApplyAt` / `lastApplyAt`
  - `jingqing_diag` 新增 `lifecycle` 字段报告上述计数
  - 判定规则：若复现后 `hostApplyCount` 增加 → Host 反复 apply（扫描结果被重置，
    每次打开都是新实例）；若仅 `panelStateCalls` 增加 → 面板加载态误显示

### 修复
- **Client 面板沙箱 API 修正**：注册必须走 `ctx.get('slots')` + `slots.inject` +
  `slots.register`（`settings.section` / `tool.view.cordis`），样式用 `styles.insert`，
  React 与 host 均为全局 builtin；此前的 `ctx.get('react')` / `document` 写法在
  沙箱中不可用会导致 Client 半区静默不注册（设置页入口消失）
- **设置页加载状态**：面板增加「加载中 / 加载失败(可重试)」状态，失败不再白屏

### 变更
- 扫描策略维持 v7.2（仅首次自动 + 手动重扫）；生命周期计数在 v1.0.0 正式版中保留为内置诊断能力

## [7.2.0] - 2026-08-15

### 变更
- **模型启停入口去重**：配置卡(F4)删除「识图路由」chips；启停唯一入口为
  「模型检测结果」卡(F2)中的每模型开关（路由顺序仍由性价比排序决定）
- **扫描策略优化**：安装/激活时首次自动扫描一次；之后**保留扫描结果**，不再因
  `llm/adapters-updated`、`credentials/updated` 自动重扫；重新扫描完全由用户
  手动触发（设置页「🔄 立即重扫」按钮 / `panel/rescan` RPC）
- 状态总览卡增加「重扫仅由手动触发」提示

## [7.1.0] - 2026-08-15

### 新增
- **Client 配置面板(风格A简约)**,按 `STYLE-A-MINIMAL-SPEC.md` 实现:
  - 设置页 `settings.section`(id=`jingqing`, order=25):状态总览 F1、模型检测结果 F2
    (全部识图模型平铺+逐模型启停)、识图路由 F3、配置 F4(总开关/参数/恢复默认)、
    日志 F5(级别过滤/刷新)
  - 运行卡片状态区 `tool.view.cordis`(key=`self`):状态徽标(模型数+推荐)
  - 双主题(跟随系统 + 手动切换),760px 居中布局
- **PanelRpc**:`jingqing/panel/{state|update|rescan|logs|reset}` 五个 JSON RPC,
  含完整校验规则(§6.4)
- **PanelConfig**:运行时内存配置(enabled/逐模型路由启停/timeoutMs/maxTokens/temperature),
  即时生效;pre-step 注入与识图工具均读运行时配置
- **性价比排序**:内置成本表 `MODEL_COST_TABLE`(来源 pi-ai 目录 cost 字段),
  score=输入×0.5+输出×0.5 升序;同分按推荐提供方/模型稳定序(保证
  `xiaomi/mimo-v2.5` 为推荐)
- **扫描结果平铺**:不再分组 recommended/fallbacks;每项含 cost/score/凭据/启停
- **引导更新**:无识图模型时推荐安装 mimoV2.5 并附官方配置文档链接
  (https://mimo.mi.com 与快速开始页);新增 `all-disabled` 原因

### 变更
- `jingqing_diag` 扩展:报告运行时配置与性价比排序结果
- 工具 `timeoutMs` 提升至 60000(与可配置软超时 20s 解耦)

## [6.0.0] - 2026-08-15

### 新增
- **模型自动检测**：启动即扫描已注册提供方与模型目录，通过 `inputModalities` 识别
  图像能力，通过 `credentials.describe` 探测 API Key 配置状态（不读取值）
- **条件执行**：检测到识图模型 → 动态路由自动识图；未检测到 → 注入用户配置引导
- **模型推荐**：引导文案推荐 `xiaomi/mimo-v2.5`（mimoV2.5）并说明性价比
  （输入 $0.14 / 输出 $0.28 每百万 token）
- **动态路由**：推荐（mimo-v2.5 双通道）→ 其余视觉模型兜底
- **自动重扫**：监听 `llm/adapters-updated` 与 `credentials/updated` 事件
- **模块化重构**：配置 / 日志 / 模型检测 / 准入绕过 / 引导 / 拦截 / 识图工具 / 诊断
  分区清晰，带完整注释

### 变更
- 识图工具文案由"MiMo"改为通用"视觉模型"（路由动态化后不再固定）
- 诊断工具扩展：报告扫描快照、推荐/兜底模型、凭据状态、引导判定、动态路由

### 修复
- （继承 v5）沙箱无 `AbortController`：改为 `exec.signal` 透传 + 循环耗时检查
- （继承 v4）准入包装不再随 fiber 生命周期还原，进程级幂等安装

## [5.0.0] - 2026-08-15

### 修复
- 动态插件沙箱（`node:vm`）不提供 `AbortController`，识图工具执行崩溃
  （`AbortController is not defined`）：
  - 移除控制器与定时器
  - 工具 `exec.signal` 直接透传给 `llm.stream`（工具超时策略中止信号 →
    适配器以 `aborted` finish 结束）
  - 流循环内按块检查取消与耗时（20s 软超时）；提前 `break` 触发迭代器 `return()`
    关闭底层请求

## [4.0.0] - 2026-08-15

### 修复
- 定位"当前模型不支持图片"提示仍出现的根因：`ctx.effect` + 引用计数的还原逻辑
  会被 cordis fiber 的 HMR 重载（注入服务提供方重启）触发清理，导致
  `resolveModelInfo` 包装反复失效（诊断：`wrapCount` 归零、`admissionView=['text']`）
- 移除 effect/计数/还原：包装改为**进程级一次性、幂等安装**，进程生命周期内持续生效
- 新增 `jingqing_diag` 诊断工具（复刻准入检查并报告包装状态）

## [3.0.0] - 2026-08-15

### 新增
- `jingqing_diag` 诊断工具：报告 `llm.resolveModelInfo` 包装状态、当前选中模型、
  准入视角与原始视角的 `inputModalities`、`wouldReject` 判定

### 修复（定位用）
- 用于定位准入绕过失效原因（`wrapCount=0`）

## [2.0.0] - 2026-08-15

### 变更
- `MIMO_MAX_TOKENS` 由 1024 降至 512（实测延迟 3–9s）
- 精简识图提示词（控制在 300 字以内）

## [1.0.0] - 2026-08-15

### 新增
- 识图能力准入绕过：包装 `llm.resolveModelInfo` 上报 `image` 模态
- `agent/pre-step` 图片检测与 plugin-notice 识图指令注入
- `jingqing_describe_image` 工具：读取图片附件 → `xiaomi/mimo-v2.5`（降级
  `opencode-go/mimo-v2.5`）→ 返回中文描述
- 工具卡片展示（可展开查看 MiMo 识图结果）
- 日志：控制台 + 内存环形缓冲 + `jingqing/status`、`jingqing/logs` RPC
- 外部通路验证脚本 `test-fixtures/verify-mimo.mjs`
