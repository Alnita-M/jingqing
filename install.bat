@echo off
title JingQing v1.0.0 - One-Click Install
echo.
echo  ============================================
echo   JingQing v1.0.0  One-Click Install
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
