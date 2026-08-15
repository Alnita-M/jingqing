# 鲸晴 JingQing · 项目总结

> 让 DeepSeek Harness 中不支持识图的对话模型(如 DeepSeek)也能看懂图片。
> **MiMo 识图 → 所选模型推理**:图片交给视觉模型(首选小米 MiMo V2.5)识别,结果交回当前对话模型继续推理。

---

## 一、项目简介

鲸晴是一个 **DeepSeek Harness 动态 Cordis 插件**,解决纯文本对话模型无法直接查看图片的问题。用户在对话中上传图片后,鲸晴自动:

1. **绕过准入检查** — 包装 `llm.resolveModelInfo`,对所有模型上报 `image` 模态,不再被"当前模型不支持图片"拦截
2. **自动调用视觉模型识图** — 按性价比动态路由,首选 `xiaomi/mimo-v2.5`,失败自动降级到其他视觉模型
3. **思维链透明展示** — 识图过程以可折叠上下文行 + 可展开工具调用卡片呈现
4. **对话模型基于描述继续推理** — 纯文本模型只需阅读识图结果即可回答用户问题

## 二、核心特性

| 特性 | 说明 |
| --- | --- |
| 🖼️ 任意模型可识图 | 纯文本模型上传图片不再被拦截,自动走视觉模型识别 |
| 🤖 模型自动检测 | 首次激活自动扫描提供方/模型/API Key 状态;之后仅手动重扫 |
| 🎯 动态路由 | 按性价比排序:xiaomi/mimo-v2.5 → opencode-go/mimo-v2.5 → 其余兜底 |
| 🖱️ 手动路由排序 | 设置页拖拽调整调用顺序(FLIP 让位动画),逐模型启停 |
| 💡 智能引导 | 无识图模型时自动注入配置引导(推荐 mimoV2.5 + 官方文档) |
| 🧠 思维链透明 | 识图过程以可折叠行 + 工具卡片呈现,结果一目了然 |
| 🛡️ 稳定可靠 | 多路由降级、超时/取消处理、扫描容错、进程级幂等准入绕过 |
| 🎛️ Client 配置面板 | 状态总览 / 模型检测 / 识图路由 / 配置 / 日志 五卡,双主题 |
| 🧩 模块化设计 | 配置/日志/检测/绕过/引导/拦截/识图/诊断/RPC 分区清晰 |

## 三、工作原理

```
用户上传图片
    │
    ▼
准入检查(鲸晴包装 resolveModelInfo 上报 image 模态)→ 不被拦截
    │
    ▼
agent/pre-step 瀑布:图片 + 模型原生不支持看图?
    ├─ 有识图模型 → 注入识图指令 notice(可折叠行)
    └─ 无识图模型 → 注入配置引导 notice(推荐 mimoV2.5)
    │
    ▼
jingqing_describe_image 工具(动态路由,支持手动排序,失败按序降级)
    │
    ▼
所选模型基于识图描述继续推理 → 输出最终回答
```

## 四、安装方式(三选一)

| 方式 | 命令 | 适合人群 |
| --- | --- | --- |
| **npm 一条命令** | `npx jingqing` | 最快,无需下载仓库 |
| Windows 脚本 | 双击 `install.bat` | Windows 用户 |
| macOS/Linux | `./install.sh` | Mac/Linux 用户 |

运行后安装消息自动复制到剪贴板 → 打开 DSH 任意会话 → 粘贴回车 → AI 自动完成定义与激活。

## 五、技术要点

- **准入绕过**:进程级幂等包装 `llm.resolveModelInfo`(不注册 fiber effect,避免 HMR 重载失效)
- **沙箱适配**:无 `AbortController` → `exec.signal` 透传 + 循环耗时检查;无 fetch/定时器
- **性价比推荐**:内置成本表,score = 输入×0.5 + 输出×0.5 升序,同分按推荐提供方/模型稳定序,保证推荐 `xiaomi/mimo-v2.5`
- **扫描策略**:仅首次自动扫描 + 手动重扫(不监听事件自动重扫)
- **Client 面板**:沙箱正确 API(`slots.inject` + 全局 React/host + `styles.insert`)

## 六、版本历史

| 版本 | 说明 |
| --- | --- |
| v1.0.1 | 新增 npm 发布(`npx jingqing`)、一键安装脚本(Windows/Mac/Linux) |
| v1.0.0 | 正式版:自 v7.3.1 收敛,版本号重新编排为语义化版本 |
| v7.x(内部) | 面板、拖拽排序、FLIP 动画、生命周期诊断、扫描策略优化等迭代 |
| v6 → v1 | 模型检测、动态路由、准入绕过、引导、多轮修复(沙箱/生命周期/推荐排序) |

## 七、发布状态

| 渠道 | 地址 | 状态 |
| --- | --- | --- |
| GitHub | https://github.com/Alnita-M/jingqing | ✅ 已发布(MIT) |
| npm | https://www.npmjs.com/package/jingqing | ✅ 已发布 v1.0.1 |

## 八、相关项目

- [Anionex/dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit) — 图片问答、长截图 OCR、UI 还原等
- [ysr666/dsh-vision-router](https://github.com/ysr666/dsh-vision-router) — 内置免费视觉链 + 像素级视觉工具

## 九、写在最后

这是一个重复造轮子的项目,虽然这个想法是自己想到的,但着手做时才发现已有不少人更早做出像素级识别。但无论如何,这是迈出的第一步——愿未来的每一步都逐渐扫清迷茫,每一个未来都由这里迈出。

---

*详细文档见 README.md / CHANGELOG.md / TEST.md / docs/ARCHITECTURE.md / docs/CLIENT-PANEL-DESIGN.md*
