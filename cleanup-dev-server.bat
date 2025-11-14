@echo off
REM Cleanup script for WorkRecall dev server
REM Kills any process using port 1420

echo Checking for processes using port 1420...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :1420 ^| findstr LISTENING') do (
    echo Found process with PID %%a
    taskkill //F //PID %%a
    if errorlevel 1 (
        echo Failed to kill process %%a
    ) else (
        echo Successfully killed process %%a
    )
)

echo.
echo Cleanup complete! You can now run: npm run tauri dev
