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
foreach ($part in 'host', 'ui') {
  $target = Join-Path $dist $part
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $root "$part\*") -Destination $target -Recurse -Force
}
Copy-Item (Join-Path $root 'package.json') (Join-Path $dist 'package.json') -Force
Copy-Item (Join-Path $root 'README.md') (Join-Path $dist 'README.md') -Force
Copy-Item (Join-Path $root 'RELEASE.md') (Join-Path $dist 'RELEASE.md') -Force

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dist 'runtime') | Out-Null
  $target = Join-Path $dist 'runtime/node.exe'
  $current = (Test-Path $target) -and ((Get-Item $target).Length -eq (Get-Item $node.Source).Length)
  if ($current) {
    Write-Host "bundled node already in place" -ForegroundColor Green
  } else {
    try {
      Copy-Item $node.Source $target -Force
      Write-Host "bundled node $(& node -v) into dist/runtime/node.exe" -ForegroundColor Green
    } catch {
      Write-Host "runtime/node.exe is in use - keeping the existing copy" -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "node not found on PATH - the exe will look for it at runtime" -ForegroundColor Yellow
}

$size = [math]::Round((Get-Item (Join-Path $dist 'PiratesShip.exe')).Length / 1KB)
Write-Host ""
Write-Host "done -> $dist\PiratesShip.exe ($size KB)" -ForegroundColor Green
Write-Host "double-click it, or run: `"$dist\PiratesShip.exe`""
