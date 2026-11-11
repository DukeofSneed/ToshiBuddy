@echo off
rem ToshiBuddy setup: double-click once. Installs what is missing and puts a
rem snowflake shortcut on your desktop. Run it again if you move this folder.
setlocal
title ToshiBuddy setup
cd /d "%~dp0"
echo Setting up ToshiBuddy in %CD%
echo.

rem Started from inside the zip (not extracted)? Then the project isn't here.
if not exist "%~dp0package.json" goto :notExtracted
if not exist "%~dp0src\main\main.js" goto :notExtracted

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
if exist "node_modules\electron\dist\electron.exe" goto :haveElectron

rem The package installed but its runtime download didn't finish (network,
rem antivirus, or install scripts turned off). Fetch it directly.
echo The runtime download did not finish. Trying again...
if exist "node_modules\electron\install.js" call node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" goto :haveElectron
call npm.cmd rebuild electron --no-audit --no-fund
if exist "node_modules\electron\dist\electron.exe" goto :haveElectron
goto :electronFailed

:haveElectron
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1"
if errorlevel 1 goto :shortcutFailed
echo.
echo Done. Start ToshiBuddy any time from the snowflake on your desktop.
echo Optional: jar upgrades also need Git and Claude Code signed in. See README.md.
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
timeout /t 6 >nul
exit /b 0

:notExtracted
echo This setup is running from inside the zip file, so the project isn't here.
echo Right-click ToshiBuddy.zip, choose "Extract All...", open the extracted
echo ToshiBuddy folder, and double-click "Setup ToshiBuddy.cmd" in there.
pause
exit /b 1

:electronFailed
echo The runtime (Electron) could not be downloaded.
echo Check the internet connection. If antivirus or a firewall blocks downloads
echo from github.com, allow it for a moment, then run this setup again.
echo If it keeps failing, delete the node_modules folder here and run setup again.
pause
exit /b 1

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
