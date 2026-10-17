@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 goto usenode
echo Ridge Rush needs Node.js to start its local web server.
echo Install Node.js, then run this launcher again.
pause
exit /b 1

:usenode
node serve.mjs --open
