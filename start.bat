@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   Social Board - Echecs et Go
echo ========================================
echo.
echo Demarrage du serveur sur http://localhost:8765
echo.
echo Appuyez sur Ctrl+C pour arreter
echo.
start http://localhost:8765
python -m http.server 8765
