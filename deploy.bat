@echo off
rem ArkPix Web 部署：构建后把 dist/* 拷入 pix_backend 的 embed 目录（internal/web/dist）
setlocal
cd /d %~dp0

call npm run build
if errorlevel 1 (
  echo [deploy] build failed, abort.
  exit /b 1
)

set "TARGET=%~dp0..\pix_backend\internal\web\dist"

rem 清目标目录旧文件后整体拷贝（目标目录由 go:embed 引用，编译后端前须存在 index.html）
if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%"
xcopy "%~dp0dist\*" "%TARGET%\" /e /i /y /q >nul
if errorlevel 1 (
  echo [deploy] copy failed.
  exit /b 1
)

echo [deploy] OK: dist -^> %TARGET%
endlocal
