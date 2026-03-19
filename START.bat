@echo off
title Job Pusher — Indika Amarasinghe
color 0A
cls

echo ============================================================
echo   JOB PUSHER — Automated Job Matcher
echo ============================================================
echo.

:: ─── Step 1: Check Python ───────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Python is not installed or not in your PATH.
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to tick "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)
echo [OK] Python found.

:: ─── Step 2: Check .env file ────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        color 0E
        echo.
        echo [SETUP] No .env file found — created one from .env.example
        echo.
        echo  *** ACTION REQUIRED ***
        echo  Open ".env" in this folder and paste your Gemini API key.
        echo  Get a free key at: https://aistudio.google.com/apikey
        echo.
        echo  Once done, save the file and run START.bat again.
        echo.
        start notepad ".env"
        pause
        exit /b 0
    ) else (
        color 0C
        echo [ERROR] No .env file found. Please create one with your GEMINI_API_KEY.
        echo.
        pause
        exit /b 1
    )
)

:: Quick check that the API key has been filled in
findstr /C:"your_gemini_api_key_here" ".env" >nul 2>&1
if not errorlevel 1 (
    color 0E
    echo.
    echo [SETUP] Your .env file still has the placeholder API key.
    echo.
    echo  *** ACTION REQUIRED ***
    echo  Open ".env" and replace "your_gemini_api_key_here" with your real key.
    echo  Get a free key at: https://aistudio.google.com/apikey
    echo.
    start notepad ".env"
    pause
    exit /b 0
)
echo [OK] .env file found.

:: ─── Step 3: Set up virtual environment ─────────────────────
if not exist ".venv\Scripts\activate.bat" (
    echo.
    echo [SETUP] Creating virtual environment (first run only — takes ~1 min)...
    python -m venv .venv
    if errorlevel 1 (
        color 0C
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created.
)

:: ─── Step 4: Activate venv ──────────────────────────────────
call ".venv\Scripts\activate.bat"
echo [OK] Virtual environment activated.

:: ─── Step 5: Install / update dependencies ──────────────────
echo.
echo [SETUP] Checking dependencies...
pip install -q -r requirements.txt
if errorlevel 1 (
    color 0C
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies ready.

:: ─── Step 6: Run the pipeline ───────────────────────────────
echo.
echo ============================================================
echo   STARTING JOB SEARCH PIPELINE
echo   This takes 5–15 minutes depending on your internet speed.
echo   Do not close this window.
echo ============================================================
echo.

python run_pipeline.py
if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Pipeline encountered an error. See above for details.
    echo.
    echo Common fixes:
    echo   - Check your GEMINI_API_KEY in .env is correct
    echo   - Check your internet connection
    echo   - Try running: python run_pipeline.py --no-ai
    echo.
    pause
    exit /b 1
)

:: ─── Step 7: Start web server ───────────────────────────────
echo.
echo ============================================================
echo   PIPELINE COMPLETE — Starting web dashboard...
echo ============================================================
echo.

:: Start HTTP server in background
start "Job Pusher Web Server" /min python -m http.server 8080

:: Small wait for server to start
timeout /t 2 /nobreak >nul

:: Open browser
echo [OK] Opening browser at http://localhost:8080/web/
start "" "http://localhost:8080/web/"

echo.
echo ============================================================
echo   Your job results are now open in your browser!
echo.
echo   Web server is running in the background.
echo   To stop it, close the "Job Pusher Web Server" window
echo   or press Ctrl+C here.
echo.
echo   Run START.bat again tomorrow for fresh results.
echo ============================================================
echo.
pause
