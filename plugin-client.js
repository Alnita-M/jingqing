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
