# 鲸晴 · Client 配置面板 — 设计文档

> 版本:草案 v0.2(按用户评审意见修订)
> 状态:✅ **已按 STYLE-A-MINIMAL-SPEC.md 实现**(v1.0.0,Host + Client 双半区)
> 关联插件版本:v1.0.0(正式版,含设置页「鲸晴」与运行卡片状态区)
> 后续演进:路由卡已从只读升级为**可拖拽手动排序**(FLIP 动画),模型检测卡价格列
> 已移至路由卡;本规格其余条目保持不变
> v0.2 修订要点:① 模型检测结果平铺列出全部已配置识图模型,每个可独立启停;
> ② 推荐路由动态选择"已安装识图模型中性价比最高者";③ 删除"其他视觉模型"分组;
> ④ 无识图模型时推荐安装 mimoV2.5 并附配置文档网页链接。

---

## 1. 背景与目标

鲸晴 v6 为 Host-only 动态插件:模型检测、准入绕过、识图工具、诊断均已在 Host 侧
实现,但**所有状态与配置都不可见、不可调**(诊断需靠对话中调用 `jingqing_diag` 工具,
参数为代码常量,修改需重新发布 Package)。

本设计为鲸晴新增 **Client 侧配置面板**,目标:

| # | 目标 | 说明 |
| --- | --- | --- |
| G1 | 可视化状态 | 插件运行状态、模型扫描结果、凭据状态、准入绕过状态一目了然 |
| G2 | 可视化配置 | 总开关、**每个识图模型的启停开关**、超时/Token/温度参数即时生效 |
| G3 | 可诊断性 | 内置日志查看器与"立即重扫"操作,无需对话内调用诊断工具 |
| G4 | 风格一致 | 完全复用 DSH 主题变量与原生组件风格,零学习成本 |
| G5 | 发布标准 | 模块化、注释、数据契约、测试齐备,达到 GitHub 发布要求 |

---

## 2. 约束与前提(必须阅读)

### 2.1 Client 半区激活需要审批授权 ⚠️

动态插件的 **Client 半区首次激活会创建审批请求**(`cordis_run` 对含 clientCode 的
Package 返回 `awaiting-approval`,需用户在 GUI 中批准一次或授权未来版本)。

**当前会话的审批策略为 `never` 且审批提示被禁用**——这意味着:
- 直接 `cordis_run` 带 Client 半区的 Package 会被**自动拒绝**,无法激活;
- 因此本设计的**部署前提**是二选一:
  1. **授权激活(首选)**:将本会话审批策略临时调整为 `ask`(或用户手动授权
     `jingq-1` 的 Client Package),首次激活时点一次"允许";
  2. **静态宿主插件(备选)**:把 Client 半区作为部署级静态插件(写入 agent
     preset 或 cordis.patch.yml 的 client 插件行),绕开动态审批——需要额外的
     组合编辑流程(editing-cordis-compositions),影响范围从单会话扩大到部署。

> 开发流程中将在 M2(见 §9)先做激活可行性验证;若两条路均不可行,按 §10
> 备选方案 C 降级(仅交付 Host RPC + 文档,面板暂缓)。

### 2.2 动态插件其他固有约束

| 约束 | 影响 |
| --- | --- |
| 进程内临时,重启后需重新激活 | 面板配置(内存态)随进程消失,见 §7 持久化策略 |
| Client 代码为纯 JS(无 JSX/TS/bundler) | UI 一律 `React.createElement`,样式用 `styles.insert` |
| Client→Host 仅 JSON(host.call) | 数据契约全部为 JSON Schema,见 §6 |
| 不操纵全局 DOM/主题 | 只注册 Slot、插入局部 CSS |
| **harness 不暴露模型价格(cost)** | 性价比计算依赖插件内置成本表,见 §5.5 |

### 2.3 风格约束

面板只使用 DSH 主题 CSS 变量(`--dsw-alias-*`,见 §4.4)与 Slot 提供的能力,
**不覆盖主题、不替换任何产品 UI 区域**。

---

## 3. 功能需求

### 3.1 功能清单

| ID | 功能 | 位置 | 交互 |
| --- | --- | --- | --- |
| F1 | 状态总览卡 | 设置页 | 只读:版本、运行状态、准入绕过、扫描时间 |
| F2 | **模型检测结果卡** | 设置页 | 只读+启停:扫描后列出**所有已配置模型中支持识图功能的模型**(平铺,每行含提供方/模型/性价比标签/启停开关) |
| F3 | **推荐路由卡** | 设置页 | 只读:显示当前推荐(已安装识图模型中性价比最高者)及排序依据 |
| F4 | 配置区 | 设置页 | 可编辑:总开关、**逐模型路由启停**(与 F2 联动)、超时/Token/温度;立即生效 |
| F5 | 日志查看器 | 设置页 | 只读:最近日志、级别过滤、刷新 |
| F6 | 操作按钮 | 设置页 | 立即重扫、恢复默认配置 |
| F7 | 运行卡片状态区 | 对话流(cordis_run 卡片) | 只读徽标 + "打开设置"快捷按钮 |

### 3.2 非目标(本版本不做)

- ❌ 模型/API Key 的在线购买或开通(仅引导文案与文档链接)
- ❌ 图片压缩/OCR 等识图能力扩展
- ❌ 多会话共享配置(配置为进程内全局,见 §7)
- ❌ 本地化(i18n)多语言面板(文案固定中文,与现有 notice 一致)

---

## 4. UI 设计

### 4.1 入口

| 入口 | Slot | 理由 |
| --- | --- | --- |
| **主入口:设置页"鲸晴"** | `settings.section`(id=`jingqing`, order=25) | 完整页面,加法式注册(replaceRisk=none);现有页 general=0/models=10/plugins=15/agent-presets=20,25 置于末尾 |
| **辅入口:运行卡片状态区** | `tool.view.cordis`(key=`self`) | 动态插件原生交互区,绑定当前 Package;用户在上一次运行卡片处即可看到状态徽标与快捷入口 |

不使用 `sidebar.footer.action` / `conversation.session.header.actions` 等入口,
避免多余按钮;设置页导航足以覆盖。

### 4.2 页面布局(设置页,垂直卡片流)

```
┌─ 鲸晴(设置页) ─────────────────────────────────────────────────┐
│                                                                │
│ ┌ F1 状态总览 ────────────────────────────────────────────────┐ │
│ │ ● 运行中 · v7.0.0         准入绕过:生效 ✅                  │ │
│ │ 上次扫描:14:32:05(3 个提供方 · 10 个识图模型)              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌ F3 推荐路由 ─────────────────────────────────────────────────┐ │
│ │ ★ 当前推荐:xiaomi/mimo-v2.5(性价比最高)                    │ │
│ │   输入 $0.14 / 输出 $0.28 每百万 token                      │ │
│ │   排序依据:内置成本表,价格升序(未知价格模型排末尾)         │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌ F2 模型检测结果(全部已配置的识图模型,可启停) ────────────────┐ │
│ │ 提供方:deepseek-official · opencode-go · xiaomi             │ │
│ │ [✓] xiaomi/mimo-v2.5      $0.14/$0.28  ★ 推荐 Key:✅       │ │
│ │ [✓] opencode-go/mimo-v2.5 $0.14/$0.28       Key:✅         │ │
│ │ [✓] xiaomi/mimo-v2-omni   $0.14/$0.28       Key:✅         │ │
│ │ [✓] opencode-go/minimax-m3 $0.30/$1.20       Key:✅        │ │
│ │ [✓] opencode-go/qwen3.7-plus $0.40/$1.60     Key:✅        │ │
│ │ [✓] opencode-go/kimi-k2.6 $0.95/$4.00        Key:✅        │ │
│ │ [✓] opencode-go/kimi-k3   $3.00/$15.00       Key:✅        │ │
│ │ …(扫描到的全部识图模型平铺,每行一个启停开关)                │ │
│ │ [🔄 立即重扫]                                               │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌ F4 参数配置 ─────────────────────────────────────────────────┐ │
│ │ [✓] 启用鲸晴识图自动流程                                      │ │
│ │ 超时(ms) [20000]  输出上限(token) [512]  温度 [0.2]          │ │
│ │ [恢复默认]                                                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌ F5 日志 ─────────────────────────────────────────────────────┐ │
│ │ [级别:全部▾] [刷新]  最近 300 条中的 100 条                   │ │
│ │ 14:32:05 info  scan       providers=3 vision=10 …            │ │
│ │ 14:31:02 info  pre-step   inject=instruction                 │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

说明:
- **F2 与 F4 的路由启停为同一数据源**;F2 中每行开关即该模型的启停控制(交互即时生效);
- 未勾选的模型不出现在实际调用路由中(工具 `pickRoutes` 只走勾选且可用的模型);
- 若全部模型被关闭,工具行为等同"无可用识图模型",触发引导(§4.5)。

### 4.3 运行卡片状态区(tool.view.cordis)

紧凑单行:`● 鲸晴 v7 · 识图就绪(10 模型 · 推荐 mimo-v2.5)` + `[设置]` 按钮(点击打开设置页)。

### 4.4 主题与样式

- 颜色/边框/文字全部引用主题变量:
  `--dsw-alias-bg-layer-1/2`、`--dsw-alias-border-l1/l2`、`--dsw-alias-label-primary/secondary`、
  `--dsw-alias-state-success-primary/error-primary/warn-primary`、`--dsw-alias-brand-primary`
- 浅色/深色自动适配(CSS 变量已含双模式)
- 组件布局用 flex/gap,圆角 8–12px,与现有设置页一致;不用内联硬编码颜色
- 局部样式通过 `styles.insert(css)` 注入,插件卸载自动清理

### 4.5 无识图模型时的引导(推荐安装 mimoV2.5 + 配置文档网页)

当扫描结果为空(或全部模型被关闭)时,notice 引导文案更新为:

```
【鲸晴·配置引导】当前环境没有可用的图像识别模型，无法自动识图。

鲸晴推荐安装 mimoV2.5（小米 MiMo V2.5）：
- 性价比最高：输入约 $0.14 / 输出约 $0.28 每百万 token
- 支持文本 + 图像双模态，中文识别质量好

配置文档网页：
- 小米 MiMo 开放平台：https://mimo.mi.com
- 快速开始（首次 API 调用）：https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call

启用步骤：
1. 按上述文档注册并获取 API Key；
2. 在 DeepSeek Harness「设置 → 模型」中添加提供方 xiaomi（模型 mimo-v2.5），
   将 Key 写入 ~/.dsh/.credentials.yaml 的 XIAOMI_API_KEY（或环境变量）；
3. 备用通道：provider opencode-go 同样提供 mimo-v2.5（OPENCODE_GO_API_KEY）；
4. 配置保存后鲸晴会自动检测并立即启用识图，无需重启。
```

> 链接为开发时已核实地址(2026-08);发布前再次校验可用性。

---

## 5. 技术设计

### 5.1 总体结构(新增部分)

```
┌─ Host(v7) ───────────────────────────┐   ┌─ Client(v7) ─────────────────────┐
│  [2] ModelDetector(改造)            │   │  PanelSettings(section)          │
│      scan: 全部视觉模型平铺 + 性价比 │   │   ├─ 状态总览卡                 │
│      排序 + recommended=第一        │   │   ├─ 推荐路由卡                 │
│  [3] AdmissionBypass(现有)          │   │   ├─ 模型检测卡(逐模型启停)      │
│  [6] DescribeTool(现有,读配置路由)  │   │   ├─ 参数配置区                 │
│  [9] PanelConfig(新增)              │   │   └─ 日志查看器                 │
│      config: enabled/routeEnabled/  │   │  PanelRunCard(tool.view.cordis) │
│      timeout/maxTokens/temperature  │   │   └─ 状态徽标 + 设置入口         │
│  [10] PanelRpc(新增)                │◀──┼───────────────────────────────────┤
│      harness.handle('jingqing/panel/│   │  host.call(method, args)        │
│        state|update|rescan|logs|reset│   │  (JSON only)                    │
└──────────────────────────────────────┘   └────────────────────────────────┘
```

### 5.2 Client 半区结构(纯 JS + React.createElement)

```js
// 伪代码结构(实现时逐字展开)
return {
  inject: [],                 // 无硬依赖
  async apply(ctx) {
    const slots = ctx.get('slots')
    // 主入口:设置页
    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'jingqing', order: 25, label: '鲸晴' },
      (props) => React.createElement(PanelSettings, { close: props.close, call: host.call })
    ))
    // 辅入口:运行卡片状态区
    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      (props) => React.createElement(PanelRunCard, { call: host.call })
    ))
  },
}
```

要点:
- `host.call(method, args)` 为动态 Client 半区内置能力,对应 Host 的 `harness.handle`;
- 面板组件自持有状态快照(state 由 Host 返回),无需订阅任何 Client 服务;
- 无数据时的降级:所有卡片显示占位与"不可用"提示,不抛错。

### 5.3 配置生效链路(即时生效,无需重启)

```
设置页交互 → host.call('jingqing/panel/update', patch)
            → [10] PanelRpc 校验(patch 白名单+范围)
            → [9] PanelConfig 更新内存配置
            → 后续 pre-step 注入 / pickRoutes / callVisionRoute 读新配置
```

### 5.4 刷新机制

| 场景 | 方式 |
| --- | --- |
| 进入设置页 | 拉取 `panel/state` 全量快照 |
| 用户操作后 | 以 `panel/update`/`panel/rescan` 返回的新快照为准 |
| 日志区 | 手动"刷新"按钮拉取 `panel/logs`(不做定时轮询;可选 5s 定时器) |
| 运行卡片 | 组件挂载时拉取一次;不实时刷新(状态变化低频率,保持简洁) |

### 5.5 性价比计算与推荐选择(新增设计)

**背景**:harness 的 `llm.listModels`/`resolveModelInfo` **不暴露模型价格**
(dsh-llm-pi-ai 明确 "never reads pi-ai's cost metadata")。因此插件内置
**成本表**,数据从 pi-ai 模型目录(`dist/providers/data/*.json` 的 `cost` 字段)
提取维护,注明来源与更新方式。

```jsonc
// [0] 配置区新增:MODEL_COST_TABLE(内置,单位:美元/百万 token)
// 来源:pi-ai 模型目录 cost 字段(2026-08 快照);新增模型未收录时按未知处理
{
  "xiaomi|mimo-v2.5":        { "input": 0.14,  "output": 0.28 },
  "opencode-go|mimo-v2.5":   { "input": 0.14,  "output": 0.28 },
  "xiaomi|mimo-v2-omni":     { "input": 0.14,  "output": 0.28 },
  "opencode-go|minimax-m3":  { "input": 0.30,  "output": 1.20 },
  "opencode-go|qwen3.7-plus":{ "input": 0.40,  "output": 1.60 },
  "opencode-go|kimi-k2.6":   { "input": 0.95,  "output": 4.00 },
  "opencode-go|kimi-k2.7-code": { "input": 0.95, "output": 4.00 },
  "opencode-go|kimi-k3":     { "input": 3.00,  "output": 15.00 },
  "opencode-go|qwen3.6-plus":{ "input": 0.50,  "output": 3.00 },
  "opencode-go|grok-4.5":    { "input": 2.00,  "output": 6.00 }
}
```

**评分与排序**(`rankVisionModels`):

```
score(model) = costTable[provider|model]
                 ? input * 0.5 + output * 0.5      // 价格加权分(越低越优)
                 : Number.POSITIVE_INFINITY         // 未收录 → 排末尾
排序:score 升序;score 相同 → 提供方稳定序(xiaomi 先于 opencode-go)
推荐(recommended)= 排序后第一个;不设固定分组
```

**语义变化**(相对 v6):
- `visionModels` = 扫描到的全部识图模型,**平铺输出**(含 score/cost 标注),不再分
  recommended / fallbacks 两组;
- `recommended` = 按性价比排序后的**第一名**(可空);
- 工具 `pickRoutes()` = 按性价比排序 → **过滤掉配置中关闭的模型** → 依序尝试;
- 全部关闭或扫描为空 → 触发引导(§4.5)。

---

## 6. 数据契约(Host RPC,全部 JSON)

### 6.1 配置模型 `JingqingConfig`

```jsonc
{
  "enabled": true,               // 总开关:false 暂停注入与识图工具(准入绕过保留)
  "routesEnabled": {             // 动态键控:所有扫描到的识图模型均可启停
    "xiaomi|mimo-v2.5": true,
    "opencode-go|mimo-v2.5": true,
    "opencode-go|kimi-k2.6": true
    // …扫描结果动态扩展;不存在的键忽略,新扫描到的模型默认启用
  },
  "timeoutMs": 20000,            // 1000..60000
  "maxTokens": 512,              // 64..4096
  "temperature": 0.2             // 0..2,步进 0.05
}
```

### 6.2 RPC 方法

| method | 入参 | 返回(统一 `PanelState`) |
| --- | --- | --- |
| `jingqing/panel/state` | `{}` | 全量快照(见下) |
| `jingqing/panel/update` | `{ "patch": Partial<JingqingConfig> }` | 新快照;非法字段/越界 → `{ "error": "…" }` |
| `jingqing/panel/rescan` | `{}` | 触发 `scan()` 后返回新快照 |
| `jingqing/panel/logs` | `{ "limit"?: 1..100, "level"?: "all"\|"info"\|"warn"\|"error" }` | `{ "logs": LogEntry[] }` |
| `jingqing/panel/reset` | `{}` | 恢复默认配置并返回新快照 |

### 6.3 `PanelState`(state/logs/rescan/reset 返回)

```jsonc
{
  "version": "v7.0.0",
  "config": { /* JingqingConfig 见上 */ },
  "runtime": {
    "running": true,
    "wrapActive": true,           // 准入绕过是否生效
    "admissionView": ["text", "image"],
    "wouldReject": false
  },
  "scan": {
    "ready": true,
    "scannedAt": 1786761500059,
    "providers": ["deepseek-official", "opencode-go", "xiaomi"],
    "visionModels": [            // 全部已配置的识图模型,平铺、按性价比排序
      { "provider": "xiaomi", "id": "mimo-v2.5", "name": "MiMo-V2.5",
        "cost": { "input": 0.14, "output": 0.28 }, "score": 0.21,
        "credential": { "apiKeyEnv": "XIAOMI_API_KEY", "configured": true },
        "enabled": true }
      /* …其余模型按 score 升序 */
    ],
    "recommended": { "provider": "xiaomi", "id": "mimo-v2.5", "name": "MiMo-V2.5" },
    "errors": []
  },
  "guidance": { "reason": null, "hasVisionModel": true },
  "routes": [ { "provider": "xiaomi", "model": "mimo-v2.5" } /* 启用且可用的路由,按性价比序 */ ],
  "logs": [ { "t": "…", "level": "info", "event": "scan", "detail": "…" } /* 最近 20 条 */ ]
}
```

> v0.1 中的 `recommended/fallbacks` 分组字段已删除;`visionModels` 每项新增
> `cost/score/credential/enabled` 供面板直接渲染(启停开关与 F2 行内展示)。

### 6.4 校验规则(update)

- 仅接受白名单字段;未知字段整体拒绝并返回错误(避免静默漂移)
- `timeoutMs` 1_000–60_000;`maxTokens` 64–4_096;`temperature` 0–2
- `routesEnabled` 键:非字符串或不属于已知视觉模型键(`provider|model`)→ 拒绝;
  值必须为布尔;允许删除键(恢复默认启用)
- 校验失败:不修改配置,返回 `{ "error": "字段 xxx 非法: …" }`,面板展示错误条

---

## 7. 配置持久化策略

| 方案 | 说明 | 采纳 |
| --- | --- | --- |
| A. 内存配置(默认) | 配置存于 Host 闭包,插件运行期有效;DSH 重启后恢复默认 | ✅ 默认 |
| B. 可选持久化 | 通过 Host `settings` 服务写入 `jingqing` namespace(需注册 schema);重启后读取 | 🔶 增强项(v7.x,按评审决定) |

理由:动态插件规范建议不引入持久化存储;方案 A 足够满足"即时调参"主诉求;
若评审要求持久化,方案 B 在 M4 后追加,不影响本设计主体。

---

## 8. 测试计划(面板相关)

| ID | 用例 | 预期 |
| --- | --- | --- |
| P1 | 激活含 Client 半区的 Package | 审批授权流程;授权后状态 running、页面可渲染 |
| P2 | 设置页入口可见 | 设置 → 侧栏出现"鲸晴"页,位于插件页之后 |
| P3 | 状态总览卡 | 版本/运行/包装/扫描时间与 `jingqing_diag` 一致 |
| P4 | 模型检测卡(平铺) | 列出**全部**已配置识图模型,含 cost/score/凭据;与 `jingqing_diag` 一致;**无 recommended/fallbacks 分组** |
| P5 | 推荐路由卡 | recommended = 性价比排序第一名(如 xiaomi/mimo-v2.5);关闭推荐模型后重扫,推荐变为次优 |
| P6 | 逐模型启停 | 关闭首选路由后,工具实际调用下一个启用路由(`describe-ok` 日志验证);关闭全部 → 工具返回引导错误 |
| P7 | 参数修改 | 修改 maxTokens=128 后识图输出明显缩短;非法值被拒并提示 |
| P8 | 立即重扫 | 返回新扫描时间戳;模拟凭据变更后 configured 状态更新;新模型自动出现在列表(默认启用) |
| P9 | 日志查看器 | 级别过滤/刷新正确;条目与 Host 日志一致 |
| P10 | 运行卡片状态区 | 徽标正确;点击"设置"能打开设置页 |
| P11 | 回归 | 面板存在时正常识图流程(准入→注入→工具→回答)不受影响 |
| P12 | 深色/浅色 | 两种主题下面板对比度与可读性正常 |
| P13 | 性价比排序 | 注入带价格的模型集,验证 score 升序与未知模型排末尾 |

---

## 9. 开发里程碑

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| **M1** | Host 侧:`PanelConfig` + `PanelRpc`(5 个 RPC)+ 性价比排序 + 配置读写点接入(pre-step/tool)+ 引导文案更新(含 mimo.mi.com 链接) | diag 扩展可读配置与排序;RPC 经工具或日志验证;无需 Client 即可完成 |
| **M2** | **激活可行性验证**:定义含 Client 半区的最小 Package,验证审批/授权路径 | 若被拒 → 启动 §10 备选方案;若通过 → 继续 |
| **M3** | Client 侧:设置页骨架 + `panel/state` 打通 + 状态/推荐/模型卡(含启停开关) | 页面渲染,数据与 Host 一致;P4/P5 过 |
| **M4** | 参数配置区 + 日志查看器 + 操作按钮 + 运行卡片状态区 | P6–P10 全过 |
| **M5** | 回归测试 + 文档(CHANGELOG/README/架构图更新)+ release 打包 | P11–P13 全过,文档齐备 |

---

## 10. 风险与备选方案

| 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- |
| Client 半区审批被拒(当前策略 never) | 高 | 面板无法激活 | 首选:用户临时调整审批策略并授权一次;备选 B:静态宿主插件;备选 C:暂缓面板,仅交付 M1(Host RPC)+ 文档 |
| 内置成本表与实际价格脱节 | 中 | 推荐排序偏差 | 表注明来源与快照日期;发布脚本提供从 pi-ai 目录生成表的说明;未知模型排末尾 |
| `settings.section` 占用冲突 | 低 | 导航异常 | 使用自有 id `jingqing`,不复用现有 id(契约明示) |
| host.call 传非 JSON | 低 | RPC 失败 | 契约强制 JSON;处理器做 cloneJson 校验(平台自带) |
| 内存配置随重启丢失 | 中 | 用户配置重置 | 文档明示;方案 B 增强 |
| Client 渲染错误 | 中 | 页面报错 | 每张卡独立错误边界;`cordis_inspect_self` 诊断 + 新 Package 修复 |
| 与并行会话的文件冲突 | 中 | 交付混乱 | 开发代码全部经动态插件 define/run 交付;发布文件写入 `release/` 目录 |

---

## 11. 待评审确认点(v0.2)

1. **审批前提**:是否接受"为激活 Client 半区临时调整审批策略/手动授权"?(§2.1)
2. **入口范围**:设置页 + 运行卡片状态区是否足够?
3. **模型展示与启停**:全部已配置识图模型平铺、逐模型启停开关(§4.2 F2)— 是否符合预期?
4. **性价比推荐**:内置成本表 + 价格加权分排序、推荐=第一名(§5.5)— 权重 input/output 各 50% 是否可接受?是否需要按"识图质量"调整?
5. **引导链接**:https://mimo.mi.com 与快速开始文档链接(§4.5)— 是否可用/需更换?
6. **持久化**:默认内存配置(方案 A)是否可接受?
7. **配置项**:总开关/逐模型启停/超时/Token/温度 是否满足?

> 确认后按 §9 里程碑开发;任何一项目前被否决,请直接批注,我会修订本设计文档。
