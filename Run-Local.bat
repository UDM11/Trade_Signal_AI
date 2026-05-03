@echo off
:: No complex logic, just simple steps
cd /d "%~dp0"
TITLE Trade Signal AI - Simple Launcher

echo [DEBUG] Script started successfully.
echo [DEBUG] Current folder: %CD%
echo.

:: Check Python
echo Checking Python...
python --version
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] 'python' command failed, trying 'py'...
    py --version
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Python is NOT installed!
        pause
        exit /b
    )
)

:: Check NPM
echo Checking NPM...
call npm -v
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is NOT installed!
    pause
    exit /b
)

echo.
echo Everything looks good. Press any key to start the app...
pause

:: Start
echo Starting Services...
echo.
call npx concurrently "cd backend && .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" "cd frontend && npm run dev -- --open"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application failed to start.
)

pause
