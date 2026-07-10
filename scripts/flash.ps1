<# IONITY PicoLink — flash helper (Windows)
   Hold BOOTSEL while plugging the Pico in, then run this.
   Auto-detects the board: RPI-RP2 drive = Pico W, RP2350 drive = Pico 2 W. #>
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot '..\firmware\prebuilt'

Write-Host '[*] Waiting for a Pico boot drive (hold BOOTSEL while plugging in)...'
for ($i = 0; $i -lt 120; $i++) {
  $v = Get-Volume -ErrorAction SilentlyContinue |
       Where-Object { $_.FileSystemLabel -match '^(RPI-RP2|RP2350)$' } |
       Select-Object -First 1
  if ($v) {
    $uf2 = if ($v.FileSystemLabel -eq 'RP2350') { 'ionity-picolink-pico2_w.uf2' } else { 'ionity-picolink-pico_w.uf2' }
    $src = Join-Path $dir $uf2
    if (-not (Test-Path $src)) { throw "UF2 not found: $src" }
    Write-Host ("[*] {0} board on {1}: — flashing {2}" -f $v.FileSystemLabel, $v.DriveLetter, $uf2)
    Copy-Item $src "$($v.DriveLetter):\" -Force
    Write-Host '[✓] Flashed — dongle rebooting as IONITY PicoLink' -ForegroundColor Green
    exit 0
  }
  Start-Sleep 1
}
throw 'No Pico boot drive appeared (RPI-RP2 / RP2350).'
