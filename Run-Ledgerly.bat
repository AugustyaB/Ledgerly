@echo off
title Launching Ledgerly Desktop...
cd /d "%~dp0"
echo Starting Ledgerly Desktop Application...
npm start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Failed to launch. Make sure Node.js is installed.
    pause
)
