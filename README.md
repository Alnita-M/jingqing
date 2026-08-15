# 鲸晴 JingQing

> 让 DeepSeek Harness 中不支持识图的对话模型（如 DeepSeek V4）也能看懂图片。
> **MiMo 识图 → 所选模型推理**：图片交给视觉模型（首选小米 MiMo V2.5）识别，结果交回当前对话模型继续推理。

![Version](https://img.shields.io/badge/version-v1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-DeepSeek%20Harness-black)
![Status](https://img.shields.io/badge/status-stable-brightgreen)

## 特性

- 🖼️ **任意模型可识图**：纯文本模型（DeepSeek 等）上传图片不再被"当前模型不支持图片"拦截，图片自动走视觉模型识别
- 🤖 **模型自动检测**：首次激活自动扫描已配置的提供方与模型，识别图像能力（多模态检测）与 API Key 配置状态；结果保留，之后仅手动重扫
- 🎯 **动态路由**：识别模型按推荐序自动选择——`xiaomi/mimo-v2.5`（首选）→ `opencode-go/mimo-v2.5` → 其余视觉模型兜底
- 🖱️ **手动路由排序**：设置页「识图路由」卡可**拖拽调整**模型调用顺序（FLIP 让位动画），支持逐模型启停；未手动排序时按性价比自动排列
- 💡 **智能引导**：未检测到可用识图模型时，自动向用户展示配置引导（推荐 mimoV2.5 并说明性价比）
- 🧠 **思维链透明**：识图过程以可折叠的上下文行 + 可展开的工具调用卡片呈现，MiMo 识图结果一目了然
- 🛡️ **稳定可靠**：多路由降级、超时/取消处理、扫描容错、进程级幂等准入绕过
- 🎛️ **Client 配置面板**：设置页「鲸晴」可视化全部状态与配置——模型检测结果
  （全部识图模型平铺、逐模型启停）、动态推荐（性价比最高者）、识图路由顺序（可拖拽）、
  参数调优、日志查看器；运行卡片内置状态徽标；双主题适配
- 🧩 **模块化设计**：配置 / 日志 / 模型检测 / 准入绕过 / 引导 / 拦截 / 识图工具 / 诊断 / 面板 RPC 分区清晰

## 工作原理

```
用户上传图片（含图片消息）
        │
        ▼
┌─ Host 准入检查 ──────────────────────────────┐
│  鲸晴包装 llm.resolveModelInfo：上报 image 模态 │ ← 绕过"当前模型不支持图片"拦截
└──────────────────────────────────────────────┘
        │
        ▼
┌─ agent/pre-step 瀑布 ────────────────────────┐
│  图片 + 当前模型原生不支持看图？              │
│    ├─ 有可用识图模型 → 注入识图指令 notice    │ ← 思维链可折叠行
│    └─ 无识图模型     → 注入配置引导 notice    │ ← 推荐 mimoV2.5 + 性价比
└──────────────────────────────────────────────┘
        │
        ▼
┌─ jingqing_describe_image 工具 ───────────────┐
│  动态路由（可手动排序）：xiaomi/mimo-v2.5 →   │
│  opencode-go/mimo-v2.5 → 其他视觉模型兜底     │
│  返回中文描述（工具卡片可展开查看）            │
└──────────────────────────────────────────────┘
        │
        ▼
所选模型基于描述继续推理 → 输出最终回答
```

## 一键安装(推荐)

鲸晴提供**一键安装**,不需要手动复制任何源码。**任选一种**方式:

**npm 一条命令(最快,无需下载仓库):**
```bash
npx jingqing
# 安装消息自动复制到剪贴板 ✅
# 然后:打开 DSH 任意会话 → 粘贴(Ctrl+V) → 回车 → 完成
```
> 鲸晴已发布到 npm:https://www.npmjs.com/package/jingqing
> `npx jingqing` 会自动下载并运行一键安装助手(需 Node.js 18+,无需提前安装任何东西)

**Windows(双击即可):**
```text
1. 进入 release 目录
2. 双击 install.bat(或命令行运行 install.bat)
3. 安装消息自动复制到剪贴板 ✅
4. 打开 DeepSeek Harness 任意会话 → 粘贴(Ctrl+V) → 回车
5. AI 自动完成插件定义与激活 —— 安装完成 ✅
```

**macOS / Linux:**
```bash
cd jingqing/release
chmod +x install.sh
./install.sh
# 安装消息自动复制到剪贴板,然后在 DSH 会话中粘贴并回车即可
```

**通用方式(Node.js 18+):**
```bash
cd jingqing/release
node install.mjs
# 同上:消息已复制到剪贴板 + 生成 INSTALL.md 备用
```

> 四种方式都只做一件事:把完整的安装消息(含全部源码与步骤)复制到剪贴板。
> 最后一步"在会话中粘贴回车"由 AI 完成定义与激活——这是 DSH 动态插件
> 的设计(插件需经会话内 AI 与授权流程),无法完全脱离会话。

## 手动安装

鲸晴是**动态 Cordis 插件**，随会话运行，无需落盘安装：

```text
1. 在会话中通过 cordis_define 定义插件（源码见 plugin-host.js）
2. 通过 cordis_run 激活（mode: run / update）
3. 验证：模型工具列表中应出现 jingqing_describe_image 与 jingqing_diag
```

> 动态插件随进程存活：DSH 重启后需重新激活（`cordis_define` + `cordis_run`）。

## 前置条件

| 项目 | 要求 |
| --- | --- |
| 识图模型（任一） | `xiaomi/mimo-v2.5`（推荐）或 `opencode-go/mimo-v2.5`，或其他支持图片输入的模型 |
| 凭据 | `XIAOMI_API_KEY`（小米官方 API）和/或 `OPENCODE_GO_API_KEY`（备用网关） |
| 配置位置 | `~/.dsh/settings.yaml`（llm-pi-ai.providers）+ `~/.dsh/.credentials.yaml`（Key） |

## 快速开始

1. 激活插件后，在对话中**直接上传图片**（可附带文字问题）
2. 观察：图片正常发送 → 出现鲸晴可折叠行 → 思维链中出现识图工具卡片 → 模型基于识图结果回答
3. 打开 **设置 → 鲸晴**：查看模型检测结果、逐模型启停、识图路由、参数调优、日志
4. 若环境缺少识图模型，将自动收到配置引导（推荐安装 mimoV2.5，附官方配置文档链接）

## 模型检测与推荐

- 首次激活时自动扫描已注册提供方（`llm.listProviders`）与模型目录（`llm.listModels`），
  通过 `inputModalities` 判断图像能力；通过 `credentials.describe` 探测 API Key 配置状态（不读取值）
- 扫描结果**平铺列出全部已配置的识图模型**（含性价比分、凭据状态），每个模型可独立启停
  （启停唯一入口：设置页「模型检测结果」卡）
- 推荐 = 已安装识图模型中**性价比最高者**（内置成本表，score = 输入×0.5 + 输出×0.5 升序；
  当前环境推荐 `xiaomi/mimo-v2.5`，输入 $0.14 / 输出 $0.28 每百万 token）
- **扫描策略**：安装后首次自动扫描一次并保留结果；之后由用户手动「立即重扫」
  （设置页按钮或 `panel/rescan` RPC），不做事件自动重扫

## 配置

运行时配置（设置 → 鲸晴 面板中修改，即时生效；无需重新发布 Package）：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| 启用鲸晴识图 | true | 总开关；关闭后暂停注入与识图工具（准入绕过保留） |
| 识图路由（逐模型） | 全部启用 | 未勾选模型不进入调用路由 |
| 识图路由顺序 | 按性价比 | 「识图路由」卡可拖拽手动排序；未排序时按性价比自动排列 |
| 超时(ms) | 20000 | 单次识图软超时（1000–60000） |
| 输出上限(token) | 512 | 描述输出上限（64–4096） |
| 温度 | 0.2 | 识图采样温度（0–2，步进 0.05） |

内置常量（需重新发布 Package）：`MODEL_COST_TABLE`（成本表，来源 pi-ai 目录）、
`RECOMMENDED_VISION_ROUTES`（推荐路由与同分稳定序）、`LOG_LIMIT`（日志上限）。

## 架构

模块分区见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：

| 模块 | 职责 |
| --- | --- |
| `[0] Config` | 推荐路由、成本表、超时/Token/温度常量；PanelConfig 运行时配置（含 routeOrder 手动排序） |
| `[1] Logger` | 环形缓冲日志 + 控制台输出 + RPC 读取 |
| `[2] ModelDetector` | 模型/凭据自动扫描（仅首次 + 手动重扫）、性价比排序、动态路由 |
| `[3] AdmissionBypass` | `llm.resolveModelInfo` 进程级幂等包装（准入绕过） |
| `[4] Guidance` | 无识图模型时的配置引导文案（推荐 mimoV2.5） |
| `[5] ImageInterceptor` | `agent/pre-step` 图片检测与 notice 注入（条件执行） |
| `[6] DescribeTool` | 识图工具（动态路由、流式收集、超时/取消） |
| `[7] DiagTool` | 诊断工具（扫描快照、包装状态、引导判定、生命周期计数） |
| `[8] PanelRpc` | `jingqing/panel/{state|update|rescan|logs|reset}` 五个 RPC |

## 测试

- 测试计划与用例见 [TEST.md](TEST.md)（含正常识图、多图、降级、容错、引导、回归）
- 外部通路验证脚本：`test-fixtures/verify-mimo.mjs`
- 测试图片：`test-fixtures/sample.png`

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 日志无 `started` | 插件未激活，重新 `cordis_run` |
| 上传图片仍被拦截 | 调用 `jingqing_diag` 检查 `wrapperActive` / `wouldReject`；进程重启后需重新激活插件 |
| 出现配置引导 notice | 环境缺少识图模型/凭据，按引导完成配置（推荐 mimoV2.5） |
| 工具报"找不到附件" | 模型臆造了 `image_ref`；检查 notice 中的附件 ID |
| 所有路由失败 | 检查 `XIAOMI_API_KEY` / `OPENCODE_GO_API_KEY` 与网络；日志 `describe-route-failed` |

## 已知限制

- 动态插件随进程存活，DSH 重启后需重新激活
- 准入绕过为进程级运行时行为（停止插件后仍生效），完全还原需重启进程
- 子智能体会话的图片限制不在本插件处理范围
- 识图结果为文本描述，不保留像素级信息；精读场景（如 OCR 版面还原）建议选原生视觉模型

## 许可证

[MIT](LICENSE)

## 变更记录

见 [CHANGELOG.md](CHANGELOG.md)。

---

## 写在最后

这是一个重复造轮子的项目，虽然这个想法是我自己想到的，但是当我着手做的时候才发现，这么多人都比我更早的有了这个想法，并且更进一步做出了像素级的识别，如[@anionex/dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit)与[@ysr666/dsh-vision-router](https://github.com/ysr666/dsh-vision-router)。

但是无论如何，这是我迈出的第一步，但愿未来的每一步都会逐渐扫清我的迷茫，每一个未来都由这里迈出
