param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Out = 'native/app.ico',
  [string]$Background = '#0A0B0E',
  [double]$Padding = 0.07,
  [double]$Threshold = 26
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$srcPath = (Resolve-Path -LiteralPath $Source).Path
Set-Location $root

$original = [System.Drawing.Image]::FromFile($srcPath)

$work = 640
$scale0 = [Math]::Min(1.0, $work / [Math]::Max($original.Width, $original.Height))
$w = [Math]::Max(1, [int][Math]::Round($original.Width * $scale0))
$h = [Math]::Max(1, [int][Math]::Round($original.Height * $scale0))
$small = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g0 = [System.Drawing.Graphics]::FromImage($small)
$g0.InterpolationMode = 'HighQualityBicubic'
$g0.PixelOffsetMode = 'HighQuality'
$g0.Clear([System.Drawing.Color]::Black)
$g0.DrawImage($original, 0, 0, $w, $h)
$g0.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$read = $small.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($read.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($read.Scan0, $bytes, 0, $bytes.Length)
$small.UnlockBits($read)
$stride = $read.Stride

$maxLum = 1.0
for ($i = 0; $i -lt $bytes.Length; $i += 4) {
  $lum = 0.2126 * $bytes[$i + 2] + 0.7152 * $bytes[$i + 1] + 0.0722 * $bytes[$i]
  if ($lum -gt $maxLum) { $maxLum = $lum }
}
$floorLum = $maxLum * 0.22
$span = [Math]::Max(1.0, $maxLum - $floorLum)

$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
$alpha = New-Object 'byte[]' ($w * $h)
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $stride
  $mrow = $y * $w
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x * 4
    $lum = 0.2126 * $bytes[$i + 2] + 0.7152 * $bytes[$i + 1] + 0.0722 * $bytes[$i]
    $a = [int][Math]::Round([Math]::Min(255.0, [Math]::Max(0.0, ($lum - $floorLum) / $span * 255.0)))
    $alpha[$mrow + $x] = [byte]$a
    if ($lum -gt $Threshold) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
if ($maxX -lt 0) { throw "no bright pixels in $Source - is the logo white on black?" }

$cropX = $minX; $cropY = $minY
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1

function New-Pool {
  param([int]$targetW, [int]$targetH, [bool]$binary, [double]$cut)
  $bmp = New-Object System.Drawing.Bitmap $targetW, $targetH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $r = New-Object System.Drawing.Rectangle 0, 0, $targetW, $targetH
  $d = $bmp.LockBits($r, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $buf = New-Object byte[] ($d.Stride * $targetH)
  for ($py = 0; $py -lt $targetH; $py++) {
    $sy0 = $cropY + [int][Math]::Floor($py * $cropH / $targetH)
    $sy1 = $cropY + [int][Math]::Ceiling(($py + 1) * $cropH / $targetH)
    if ($sy1 -le $sy0) { $sy1 = $sy0 + 1 }
    if ($sy1 -gt $cropY + $cropH) { $sy1 = $cropY + $cropH }
    for ($px = 0; $px -lt $targetW; $px++) {
      $sx0 = $cropX + [int][Math]::Floor($px * $cropW / $targetW)
      $sx1 = $cropX + [int][Math]::Ceiling(($px + 1) * $cropW / $targetW)
      if ($sx1 -le $sx0) { $sx1 = $sx0 + 1 }
      if ($sx1 -gt $cropX + $cropW) { $sx1 = $cropX + $cropW }
      $m = 0
      for ($sy = $sy0; $sy -lt $sy1; $sy++) {
        $base = $sy * $w
        for ($sx = $sx0; $sx -lt $sx1; $sx++) {
          $a = $alpha[$base + $sx]
          if ($a -gt $m) { $m = $a }
        }
      }
      if ($binary) {
        if ($m -lt $cut) { $m = 0 } else { $m = 255 }
      } elseif ($m -lt 20) {
        $m = 0
      }
      $o = $py * $d.Stride + $px * 4
      $buf[$o] = 255; $buf[$o + 1] = 255; $buf[$o + 2] = 255; $buf[$o + 3] = [byte]$m
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $d.Scan0, $buf.Length)
  $bmp.UnlockBits($d)
  return $bmp
}

$poolSmallH = [Math]::Max(1, [int][Math]::Round(64.0 * $cropH / $cropW))
$poolBigH = [Math]::Max(1, [int][Math]::Round(256.0 * $cropH / $cropW))
$poolSmall = New-Pool -targetW 64 -targetH $poolSmallH -binary $true -cut 44
$poolBig = New-Pool -targetW 256 -targetH $poolBigH -binary $false -cut 0

$bg = [System.Drawing.ColorTranslator]::FromHtml($Background)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($s in $sizes) {
  if ($s -le 64) { $srcBmp = $poolSmall; $poolW = 64; $poolH = $poolSmallH }
  else { $srcBmp = $poolBig; $poolW = 256; $poolH = $poolBigH }

  $tile = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($tile)
  $g.Clear($bg)
  $g.InterpolationMode = if ($s -le 64) { 'NearestNeighbor' } else { 'HighQualityBicubic' }
  $g.PixelOffsetMode = 'Half'
  $inner = [Math]::Max(1.0, $s * (1.0 - 2.0 * $Padding))
  $fit = [Math]::Min($inner / $poolW, $inner / $poolH)
  $dw = [Math]::Max(1, [int][Math]::Round($poolW * $fit))
  $dh = [Math]::Max(1, [int][Math]::Round($poolH * $fit))
  $dx = [int][Math]::Round(($s - $dw) / 2.0)
  $dy = [int][Math]::Round(($s - $dh) / 2.0)
  $dest = New-Object System.Drawing.Rectangle $dx, $dy, $dw, $dh
  $src = New-Object System.Drawing.Rectangle 0, 0, $poolW, $poolH
  $g.DrawImage($srcBmp, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  if ($s -eq 64) {
    $r64 = New-Object System.Drawing.Rectangle 0, 0, 64, 64
    $d64 = $tile.LockBits($r64, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $rowBytes = 64 * 4
    $raw64 = New-Object byte[] ($rowBytes * 64)
    for ($yy = 0; $yy -lt 64; $yy++) {
      $ptr = [IntPtr]($d64.Scan0.ToInt64() + $yy * $d64.Stride)
      [System.Runtime.InteropServices.Marshal]::Copy($ptr, $raw64, $yy * $rowBytes, $rowBytes)
    }
    $tile.UnlockBits($d64)
    for ($k = 0; $k -lt $raw64.Length; $k += 4) {
      $tmp = $raw64[$k]
      $raw64[$k] = $raw64[$k + 2]
      $raw64[$k + 2] = $tmp
    }
    [System.IO.File]::WriteAllBytes((Join-Path $root 'native/app-icon.rgba'), $raw64)
  }

  $ms = New-Object System.IO.MemoryStream
  $tile.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $frames += [pscustomobject]@{ Size = $s; Bytes = $ms.ToArray() }
  $ms.Dispose()
  $tile.Dispose()
}
$poolSmall.Dispose()
$poolBig.Dispose()
$original.Dispose()

$outMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $outMs
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$frames.Count)
$offset = 6 + 16 * $frames.Count
foreach ($f in $frames) {
  $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }
  $bw.Write([byte]$dim)
  $bw.Write([byte]$dim)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$f.Bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $f.Bytes.Length
}
foreach ($f in $frames) { $bw.Write($f.Bytes) }
$bw.Flush()
$target = Join-Path $root $Out
[System.IO.File]::WriteAllBytes($target, $outMs.ToArray())
$bw.Dispose(); $outMs.Dispose()

$kb = [math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host "wrote $target ($kb KB, $($sizes -join '/') px, art $cropW x $cropH)"
