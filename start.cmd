@echo off
rem Double-click to start ToshiBuddy.
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe call npm.cmd install
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
