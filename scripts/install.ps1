<#
  IONITY PicoLink — one-shot initiation from Git (Windows)
  Usage:  powershell -ExecutionPolicy Bypass -File install.ps1
  Clones/updates the repo, installs the Console, offers to flash firmware.
#>
$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/Ionity-Global/picolink'
$Dest = Join-Path $env:USERPROFILE 'IONITY\picolink'

Write-Host ''
Write-Host '  IONITY PicoLink — initiation' -ForegroundColor Cyan
Write-Host '  ============================' -ForegroundColor Cyan

function Need($cmd, $url) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "[!] $cmd is required — opening $url" -ForegroundColor Yellow
    Start-Process $url
    throw "$cmd missing"
  }
}
Need git  'https://git-scm.com/download/win'
Need npm  'https://nodejs.org'

if (Test-Path (Join-Path $Dest '.git')) {
  Write-Host '[*] Updating existing clone...'
  git -C $Dest pull --ff-only
} else {
  Write-Host "[*] Cloning $Repo"
  New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
  git clone $Repo $Dest
}

# ---- Desktop console (offline after this) ----
Push-Location (Join-Path $Dest 'desktop')
Write-Host '[*] Installing Console dependencies (one-time)...'
npm install --no-audit --no-fund
Pop-Location

# ---- Start-menu style launcher ----
$lnkDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$cmdPath = Join-Path $Dest 'scripts\launch-console.cmd'
"@echo off`r`ncd /d `"$Dest\desktop`"`r`nnpm start" | Set-Content -Encoding ascii $cmdPath
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $lnkDir 'IONITY PicoLink Console.lnk'))
$lnk.TargetPath = $cmdPath
$lnk.IconLocation = (Join-Path $Dest 'desktop\assets\icon.png')
$lnk.Save()
Write-Host '[*] Start-menu shortcut created.'

# ---- Optional: flash firmware if a Pico is in BOOTSEL mode ----
$rp2 = Get-Volume -ErrorAction SilentlyContinue | Where-Object FileSystemLabel -eq 'RPI-RP2'
if ($rp2) {
  $uf2 = Join-Path $Dest 'firmware\prebuilt\ionity-picolink-pico_w.uf2'
  Write-Host "[*] Pico in BOOTSEL detected on $($rp2.DriveLetter): — flashing PicoLink..." -ForegroundColor Cyan
  Copy-Item $uf2 "$($rp2.DriveLetter):\"
  Write-Host '[✓] Firmware flashed. The dongle will reboot as IONITY PicoLink.'
} else {
  Write-Host '[i] To flash: hold BOOTSEL while plugging the Pico in, then run scripts\flash.ps1'
}

Write-Host ''
Write-Host '[✓] Done. Bluetooth works the moment the dongle is plugged in.' -ForegroundColor Green
Write-Host '    Launch the Console from the Start menu, or: cd desktop && npm start'
