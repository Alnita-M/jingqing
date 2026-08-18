#!/usr/bin/env sh
# 鲸晴 JingQing v1.1.x - 一键安装(macOS / Linux,动态助手)
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未找到 Node.js。"
  echo "       请先安装 Node.js 18+ : https://nodejs.org"
  exit 1
fi

echo "提示:想要\"装一次、永久生效\"的静态插件(含面板),请改运行:"
echo "     npx -y -p jingqing jingqing-static"
echo ""

node install.mjs

echo ""
echo "============================================"
echo "  安装消息已复制到剪贴板 ✅"
echo ""
echo "  最后一步:"
echo "  1. 打开 DeepSeek Harness 任意会话"
echo "  2. 直接粘贴(Ctrl+V / Cmd+V)并按回车"
echo "  3. AI 自动完成定义与激活 - 安装完成"
echo "============================================"
