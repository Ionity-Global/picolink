<#
  IONITY PicoLink — hands-free OTA flash over serial (no BOOTSEL button).
  Requires firmware v1.1.3+ running (provides the BOOTLOADER command).
  Usage:  powershell -ExecutionPolicy Bypass -File ota-flash.ps1
#>
$ErrorActionPreference = 'Stop'
$prebuilt = Join-Path $PSScriptRoot '..\firmware\prebuilt'

function Find-Com {
  (Get-CimInstance Win32_SerialPort | Where-Object { $_.Description -match 'USB Serial' } |
    Select-Object -First 1).DeviceID
}

$com = Find-Com
if (-not $com) { Write-Host '[ota] no PicoLink CDC port — is it plugged in and not held by the Console?'; exit 1 }
Write-Host "[ota] PicoLink on $com — sending BOOTLOADER"
try {
  $p = New-Object System.IO.Ports.SerialPort $com, 115200, None, 8, One
  $p.DtrEnable = $true; $p.Open(); Start-Sleep -Milliseconds 300
  $p.WriteLine('BOOTLOADER'); Start-Sleep -Milliseconds 700; $p.Close()
} catch { Write-Host "[ota] (BOOTLOADER send note: $($_.Exception.Message))" }

$boot = $null
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep 1
  $boot = Get-Volume -ErrorAction SilentlyContinue |
          Where-Object { $_.FileSystemLabel -match '^(RP2350|RPI-RP2)$' } | Select-Object -First 1
  if ($boot) { break }
}
if (-not $boot) { Write-Host '[ota] no boot drive appeared — hold BOOTSEL and use flash.ps1 once'; exit 1 }

$dl  = $boot.DriveLetter
$uf2 = if ($boot.FileSystemLabel -eq 'RP2350') { 'ionity-picolink-pico2_w.uf2' } else { 'ionity-picolink-pico_w.uf2' }
$src = Join-Path $prebuilt $uf2
Write-Host "[ota] $($boot.FileSystemLabel) on ${dl}: — writing $uf2 ($((Get-Item $src).Length) bytes)"
Copy-Item $src "${dl}:\NEW.UF2" -Force

$gone = $false
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep 1
  if (-not (Get-Volume -ErrorAction SilentlyContinue | Where-Object DriveLetter -eq $dl)) { $gone = $true; break }
}
if ($gone) { Write-Host '[ota] boot drive ejected — flash accepted, rebooting' }
else { Write-Host '[ota] warning: boot drive still present — flash may not have taken' }

Start-Sleep 12
$com2 = Find-Com
if (-not $com2) { Write-Host '[ota] device did not re-enumerate yet'; exit 1 }
try {
  $p = New-Object System.IO.Ports.SerialPort $com2, 115200, None, 8, One
  $p.DtrEnable = $true; $p.ReadTimeout = 2000; $p.Open()
  Start-Sleep -Milliseconds 600; $p.DiscardInBuffer()
  $p.WriteLine('HELLO'); Start-Sleep -Milliseconds 1000
  $p.WriteLine('STATUS'); Start-Sleep -Milliseconds 1300
  $r = $p.ReadExisting(); $p.Close()
  ($r -split "`r?`n") | Where-Object { $_ -match '^(ID|STAT) ' } | ForEach-Object { Write-Host "[ota] $_" }
} catch { Write-Host "[ota] verify note: $($_.Exception.Message)" }
