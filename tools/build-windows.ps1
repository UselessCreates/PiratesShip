$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "compiling the native shell..." -ForegroundColor Cyan
& cmd.exe /c "`"$root\tools\build-native.bat`""
if ($LASTEXITCODE -ne 0) { throw "native build failed (exit $LASTEXITCODE)" }

$exe = Join-Path $root 'native/target/release/PiratesShip.exe'
if (-not (Test-Path $exe)) { throw "expected $exe - did the crate name change?" }

$dist = Join-Path $root 'dist'
if (Test-Path $dist) {
  try {
    Remove-Item -Recurse -Force $dist -ErrorAction Stop
  } catch {
    Write-Host "dist is in use (close PiratesShip first) - updating in place" -ForegroundColor Yellow
  }
}
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Copy-Item $exe (Join-Path $dist 'PiratesShip.exe') -Force
Copy-Item -Recurse -Force (Join-Path $root 'host') (Join-Path $dist 'host')
Copy-Item -Recurse -Force (Join-Path $root 'ui') (Join-Path $dist 'ui')
Copy-Item (Join-Path $root 'package.json') (Join-Path $dist 'package.json') -Force
Copy-Item (Join-Path $root 'README.md') (Join-Path $dist 'README.md') -Force

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dist 'runtime') | Out-Null
  Copy-Item $node.Source (Join-Path $dist 'runtime/node.exe') -Force
  Write-Host "bundled node $(& node -v) into dist/runtime/node.exe" -ForegroundColor Green
} else {
  Write-Host "node not found on PATH - the exe will look for it at runtime" -ForegroundColor Yellow
}

$size = [math]::Round((Get-Item (Join-Path $dist 'PiratesShip.exe')).Length / 1KB)
Write-Host ""
Write-Host "done -> $dist\PiratesShip.exe ($size KB)" -ForegroundColor Green
Write-Host "double-click it, or run: `"$dist\PiratesShip.exe`""
