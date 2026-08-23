@echo off
rem ArkPix Web 部署：构建后�?dist/* 拷入 pixiv-relay �?embed 目录（internal/web/dist�?
setlocal
cd /d %~dp0

call npm run build
if errorlevel 1 (
  echo [deploy] build failed, abort.
  exit /b 1
)

set "TARGET=%~dp0..\pixiv-relay\internal\web\dist"

rem 清目标目录旧文件后整体拷贝（目标目录�?go:embed 引用，编译后端前须存�?index.html�?
if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%"
xcopy "%~dp0dist\*" "%TARGET%\" /e /i /y /q >nul
if errorlevel 1 (
  echo [deploy] copy failed.
  exit /b 1
)

echo [deploy] OK: dist -^> %TARGET%
endlocal
