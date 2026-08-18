@echo off
title JingQing - One-Click Install (Dynamic Helper)
echo.
echo  ============================================
echo   JingQing  One-Click Install
echo   (动态安装助手:生成消息 → 会话粘贴激活)
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js not found.
  echo          Install Node.js 18+ from: https://nodejs.org
  echo          Then run this script again.
  echo.
  pause
  exit /b 1
)

echo  提示:想要"装一次、永久生效"的静态插件(含面板),请改运行:
echo        npx -y -p jingqing jingqing-static
echo.

node install.mjs
if errorlevel 1 (
  echo.
  echo  [ERROR] Install helper failed. Make sure install.mjs
  echo          is in the same folder as this script.
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   Install message copied to clipboard. Done!
echo  ============================================
echo.
pause
