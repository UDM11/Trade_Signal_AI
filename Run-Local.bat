@echo off
SETLOCAL EnableDelayedExpansion
cd /d "%~dp0"
TITLE Trade Signal AI - Unified Launcher

echo.
echo ============================================================
echo           TRADE SIGNAL AI - INSTITUTIONAL TERMINAL
echo ============================================================
echo.

:: 1. Basic Requirement Checks
python --version >nul 2>&1 || (echo [ERROR] Python not found. Please install Python. && pause && exit /b)
call npm -v >nul 2>&1 || (echo [ERROR] Node.js/NPM not found. Please install Node.js. && pause && exit /b)

:: 2. Root Dependencies (for concurrently)
if not exist "node_modules" (
    echo [1/4] Installing Root dependencies (Concurrently)...
    call npm install
) else (
    echo [OK] Root dependencies found.
)

:: 3. Backend Setup
echo [2/4] Verifying Backend (Python VENV)...
if not exist "backend\venv" (
    echo [INFO] Creating Backend Virtual Environment...
    cd backend
    python -m venv venv
    call venv\Scripts\activate
    echo [INFO] Installing Backend requirements...
    call pip install -r requirements.txt
    cd ..
) else (
    echo [OK] Backend VENV found.
)

:: 4. Frontend Setup
echo [3/4] Verifying Frontend (Vite)...
if not exist "frontend\node_modules" (
    echo [INFO] Installing Frontend node_modules...
    cd frontend
    call npm install
    cd ..
) else (
    echo [OK] Frontend node_modules found.
)

:: 5. Launch Unified Environment
echo [4/4] Launching Unified Development Environment...
echo [INFO] Backend will run on http://localhost:8000
echo [INFO] Frontend will launch in your default browser...
echo.

:: Use the root npm script which runs concurrently
call npm run dev

echo.
echo ============================================================
echo   Launcher has stopped. Press any key to exit.
echo ============================================================
pause
