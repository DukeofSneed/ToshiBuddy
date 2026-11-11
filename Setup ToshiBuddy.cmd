@echo off
rem ToshiBuddy setup: double-click once. Installs what is missing and puts a
rem snowflake shortcut on your desktop. Run it again if you move this folder.
setlocal
title ToshiBuddy setup
cd /d "%~dp0"
echo Setting up ToshiBuddy in %CD%
echo.

where node >nul 2>nul
if errorlevel 1 goto :needNode
goto :haveNode

:needNode
echo Node.js is needed once, to download ToshiBuddy's runtime.
where winget >nul 2>nul
if errorlevel 1 goto :noWinget
choice /M "Install Node.js LTS now with winget"
if errorlevel 2 goto :stopped
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%PATH%;%ProgramFiles%\nodejs"
where node >nul 2>nul
if errorlevel 1 goto :restartNeeded
goto :haveNode

:haveNode
if exist "node_modules\electron\dist\electron.exe" goto :haveElectron
echo Downloading the runtime (one time, about 100 MB)...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto :npmFailed

:haveElectron
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1"
if errorlevel 1 goto :shortcutFailed
echo.
echo Done. Start ToshiBuddy any time from the snowflake on your desktop.
echo Optional: jar upgrades also need Git and Claude Code signed in. See README.md.
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
timeout /t 6 >nul
exit /b 0

:noWinget
echo Install Node.js LTS from https://nodejs.org, then run this setup again.
pause
exit /b 1

:restartNeeded
echo Node.js was installed. Close this window and run the setup again.
pause
exit /b 1

:npmFailed
echo Downloading the runtime failed. Check your internet connection and try again.
pause
exit /b 1

:shortcutFailed
echo Could not create the desktop shortcut. You can still start ToshiBuddy with start.cmd.
pause
exit /b 1

:stopped
echo Setup stopped.
pause
exit /b 1
