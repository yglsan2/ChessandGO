@echo off
cd /d "%~dp0\.."
echo.
echo   Echecs seul :  http://localhost:8765/chess/
echo   Ensemble :     http://localhost:8765/
echo.
start http://localhost:8765/chess/
python -m http.server 8765
