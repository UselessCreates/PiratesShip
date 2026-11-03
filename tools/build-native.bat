@echo off
rem Build the PiratesShip native shell.
rem
rem Two Windows traps this handles:
rem  1. vcvars64.bat fails on some VS installs, leaving LIB untouched, so the
rem     linker inherits a stale LIB from another project and dies with
rem     LNK1181: cannot open input file 'kernel32.lib'. We find the MSVC toolset
rem     and the Windows SDK ourselves and set PATH / INCLUDE / LIB explicitly.
rem  2. "C:\Program Files (x86)" contains parentheses, which terminate
rem     if(...) blocks at parse time. Every path used inside a block is read
rem     through delayed expansion (!VAR!) so nothing gets injected.
setlocal enabledelayedexpansion
set "HERE=%~dp0"
set "PF86=%ProgramFiles(x86)%"
if not defined PF86 set "PF86=C:\Program Files (x86)"
set "VSROOT="
set "VSWHERE=!PF86!\Microsoft Visual Studio\Installer\vswhere.exe"

if exist "!VSWHERE!" (
  for /f "usebackq delims=" %%V in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSROOT=%%V"
)

if not defined VSROOT (
  for /d %%A in ("%ProgramFiles%\Microsoft Visual Studio\*") do (
    for /d %%B in ("%%~A\*") do (
      if exist "%%~B\VC\Tools\MSVC" set "VSROOT=%%~B"
    )
  )
)

if not defined VSROOT (
  echo [build] no Visual Studio with the C++ toolset was found.
  echo         winget install --exact --id Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet"
  exit /b 1
)

set "MSVC="
for /d %%A in ("!VSROOT!\VC\Tools\MSVC\*") do set "MSVC=%%~A"
if not defined MSVC (
  echo [build] no MSVC toolset under !VSROOT!\VC\Tools\MSVC
  exit /b 1
)

set "KITS=!PF86!\Windows Kits\10"
set "SDK="
for /d %%A in ("!KITS!\Lib\*") do set "SDK=%%~A"
if not defined SDK (
  echo [build] no Windows SDK found under !KITS!\Lib
  exit /b 1
)

set "PATH=!MSVC!\bin\Hostx64\x64;!PATH!"
set "INCLUDE=!MSVC!\include;!SDK!\ucrt;!SDK!\um;!SDK!\shared;!SDK!\winrt"
set "LIB=!MSVC!\lib\x64;!SDK!\ucrt\x64;!SDK!\um\x64"

rem Some Windows SDK installs ship without dbghelp.lib. rustc links it for std
rem backtraces, so a missing copy is fatal with LNK1181. sdk-stubs holds an
rem import library generated from C:\Windows\System32\dbghelp.dll.
set "STUBS=!HERE!..\native\sdk-stubs"
if exist "!STUBS!\dbghelp.lib" set "LIB=!LIB!;!STUBS!"

if not exist "!SDK!\um\x64\kernel32.lib" echo [build] warning: kernel32.lib missing from !SDK!\um\x64

echo [build] msvc: !MSVC!
echo [build] sdk:  !SDK!

set "CARGO=!USERPROFILE!\.cargo\bin\cargo.exe"
if not exist "!CARGO!" set "CARGO=cargo"

echo [build] cargo build --release
"%CARGO%" build --release --manifest-path "!HERE!..\native\Cargo.toml"
if errorlevel 1 (
  echo [build] cargo failed
  exit /b 1
)

echo [build] ok
exit /b 0
