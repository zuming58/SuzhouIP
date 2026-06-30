@echo off
setlocal
cd /d "%~dp0"

set "WEB_URL=http://127.0.0.1:5500/suliniang_ui_demo/index.html"
set "VOICE_URL=http://127.0.0.1:8787/health"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js or open this project from the Codex environment.
  pause
  exit /b 1
)

if not exist "voice_bridge\node_modules" (
  echo [INFO] Installing voice bridge dependencies...
  pushd voice_bridge
  call npm install
  if errorlevel 1 (
    popd
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  popd
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (netstat -ano | Select-String ':8787\s+.*LISTENING')) { Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','Set-Location ''%CD%\voice_bridge''; node server.js *> ''%CD%\_server_voice.log''' -WindowStyle Hidden }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (netstat -ano | Select-String ':5500\s+.*LISTENING')) { Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','Set-Location ''%CD%''; node tools/static-server.mjs *> ''%CD%\_server_static.log''' -WindowStyle Hidden }"

echo [INFO] Waiting for services...
timeout /t 3 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $health = Invoke-WebRequest -UseBasicParsing '%VOICE_URL%' -TimeoutSec 5; Write-Host '[OK] Voice bridge:' $health.Content } catch { Write-Host '[WARN] Voice bridge is not ready:' $_.Exception.Message }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $page = Invoke-WebRequest -UseBasicParsing '%WEB_URL%' -TimeoutSec 5; Write-Host '[OK] UI server:' $page.StatusCode } catch { Write-Host '[WARN] UI server is not ready:' $_.Exception.Message }"

echo [INFO] Opening %WEB_URL%
start "" "%WEB_URL%"

echo.
echo Services are running in hidden windows.
echo Voice log: %CD%\_server_voice.log
echo Web log:   %CD%\_server_static.log
echo.
pause
