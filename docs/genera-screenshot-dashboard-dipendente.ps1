param(
  [string]$MockHtmlPath = "$(Split-Path -Parent $PSCommandPath)\employee-mock.html",
  [string]$OutDir = "$(Split-Path -Parent $PSCommandPath)\img"
)

$ErrorActionPreference = "Stop"

function Find-EdgeExe {
  $candList = @()
  if ($env:ProgramFiles) {
    $candList += (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
  }
  try {
    if (${env:ProgramFiles(x86)}) {
      $candList += (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
    }
  } catch {}
  if ($env:LocalAppData) {
    $candList += (Join-Path $env:LocalAppData "Microsoft\Edge\Application\msedge.exe")
  }

  # forza array anche se c'è 1 solo risultato
  $candidates = @($candList | Where-Object { $_ -and (Test-Path $_) })
  if ($candidates.Length -gt 0) { return $candidates[0] }

  try {
    $c = Get-Command msedge -ErrorAction Stop
    if ($c -and (Test-Path $c.Source)) { return $c.Source }
  } catch {}

  return $null
}

if (!(Test-Path $MockHtmlPath)) {
  throw "File demo non trovato: $MockHtmlPath"
}

$edge = Find-EdgeExe
if (-not $edge) {
  throw "Microsoft Edge non trovato (msedge.exe)."
}

New-Item -ItemType Directory -Force $OutDir | Out-Null

$p = (Resolve-Path $MockHtmlPath).Path
$u = "file:///" + ($p -replace "\\","/")

Write-Host "Edge :" $edge
Write-Host "Mock :" $p
Write-Host "URL  :" $u
Write-Host "Out  :" (Resolve-Path $OutDir).Path

function Shot([string]$name, [string]$hash, [string]$size) {
  $out = Join-Path $OutDir $name
  Write-Host "->" $name $hash $size
  & $edge --headless=new --disable-gpu --hide-scrollbars --window-size=$size --screenshot="$out" ($u + $hash) | Out-Null
  if (!(Test-Path $out)) { throw "Screenshot non creato: $out" }
}

# Desktop-like
Shot "01-home.png"      "#home"      "1280,720"
Shot "02-ore.png"       "#ore"       "1280,900"
Shot "03-richieste.png" "#richieste" "1280,900"
Shot "04-prodotti.png"  "#prodotti"  "1280,900"
Shot "05-archivio.png"  "#archivio"  "1280,900"

Write-Host "OK: screenshot creati in $OutDir"

