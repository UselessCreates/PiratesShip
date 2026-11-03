@echo off
setlocal
set "PATH=%SystemRoot%\System32;%SystemRoot%;%PATH%"
cd /d "%~dp0"
title PiratesShip

if not exist "dist\PiratesShip.exe" (
  echo dist\PiratesShip.exe is missing - run build.bat first.
  if /i not "%~1"=="nopause" pause
  exit /b 1
)

tasklist /fi "imagename eq PiratesShip.exe" 2>nul | find /i "PiratesShip.exe" >nul
if not errorlevel 1 (
  echo PiratesShip is already open.
  exit /b 0
)

echo starting dist\PiratesShip.exe
start "" "%~dp0dist\PiratesShip.exe"
exit /b 0
