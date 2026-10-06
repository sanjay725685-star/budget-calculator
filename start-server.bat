@echo off
title Personal Budget Calculator - Server
color 0A
echo.
echo  =====================================================
echo   Personal Budget Calculator - Starting Server...
echo  =====================================================
echo.
echo  Opening VS Code...
start "" code "C:\Users\Sanjay kumar\OneDrive\Pictures\Screenshots\iris ai\finance app\budget-calculator"

echo  Starting Node.js backend server...
cd /d "%~dp0"
node server.js

pause
