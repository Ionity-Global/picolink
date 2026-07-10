<# IONITY PicoLink — flash helper (Windows)
   Hold BOOTSEL while plugging the Pico W in, then run this. #>
$ErrorActionPreference = 'Stop'
$uf2 = Join-Path $PSScriptRoot '..\firmware\prebuilt\ionity-picolink-pico_w.uf2'
if (-not (Test-Path $uf2)) { throw "UF2 not found: $uf2 (build firmware first)" }

Write-Host '[*] Waiting for RPI-RP2 drive (hold BOOTSEL while plugging in)...'
for ($i = 0; $i -lt 60; $i++) {
  $v = Get-Volume -ErrorAction SilentlyContinue | Where-Object FileSystemLabel -eq 'RPI-RP2'
  if ($v) {
    Copy-Item $uf2 "$($v.DriveLetter):\"
    Write-Host "[✓] Flashed to $($v.DriveLetter): — dongle rebooting as IONITY PicoLink" -ForegroundColor Green
    exit 0
  }
  Start-Sleep 1
}
throw 'RPI-RP2 drive never appeared.'
