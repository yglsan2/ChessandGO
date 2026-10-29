@echo off
cd /d "%~dp0\.."
echo.
echo   Go seul :   http://localhost:8765/go/
echo   Ensemble :  http://localhost:8765/
echo.
start http://localhost:8765/go/
python -m http.server 8765
