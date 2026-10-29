@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   Social Board - Echecs et Go
echo ========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js introuvable — fallback Python http.server
  echo Ensemble :  http://localhost:8765
  start http://localhost:8765
  python -m http.server 8765
  goto :eof
)
echo Ensemble :  http://localhost:8765
echo Echecs :    http://localhost:8765/chess/
echo Go :        http://localhost:8765/go/
echo API :       http://localhost:8765/api/health
echo.
echo Appuyez sur Ctrl+C pour arreter
echo.
start http://localhost:8765
node server/index.js
