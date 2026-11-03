@echo off
setlocal
set "PATH=%SystemRoot%\System32;%SystemRoot%;%PATH%"
cd /d "%~dp0"
title PiratesShip build

echo.
echo === 1/3  icon ===
if not exist "ui\assets\ship.png" goto noicon
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\make-icon.ps1" -Source "ui\assets\ship.png"
if errorlevel 1 goto failed
goto iconready
:noicon
echo     no ui\assets\ship.png - keeping the current icon
:iconready

echo.
echo === 2/3  close a running copy ===
tasklist /fi "imagename eq PiratesShip.exe" 2>nul | find /i "PiratesShip.exe" >nul
if errorlevel 1 goto notrunning
if /i "%~2"=="/y" goto closeit
set "ANSWER="
set /p "ANSWER=PiratesShip is running. close it now? [Y/n] "
if /i "%ANSWER%"=="n" goto cancelled
:closeit
echo     closing PiratesShip.exe
taskkill /im PiratesShip.exe /t /f >nul 2>&1
ping -n 3 127.0.0.1 >nul
goto afterclose
:notrunning
echo     not running
goto afterclose
:cancelled
echo     cancelled - close PiratesShip and run build.bat again.
goto failed
:afterclose

echo.
echo === 3/3  compile + package ===
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\build-windows.ps1"
if errorlevel 1 goto failed

echo.
echo built. run.bat launches dist\PiratesShip.exe
if /i not "%~1"=="nopause" pause
exit /b 0

:failed
echo.
echo BUILD FAILED - the messages above say why.
if /i not "%~1"=="nopause" pause
exit /b 1
