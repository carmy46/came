param(
  [string]$HtmlPath = "$(Split-Path -Parent $PSCommandPath)\guida-dashboard-dipendente.html",
  [string]$PdfPath  = "$(Split-Path -Parent $PSCommandPath)\Guida_Dashboard_Dipendente.pdf"
)

$ErrorActionPreference = "Stop"

function Find-BrowserExe {
  # Prova prima i percorsi più comuni (Edge/Chrome) e poi Get-Command.
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) { return $candidates[0] }

  foreach ($cmd in @("msedge","chrome")) {
    try {
      $c = Get-Command $cmd -ErrorAction Stop
      if ($c -and (Test-Path $c.Source)) { return $c.Source }
    } catch {}
  }

  return $null
}

if (!(Test-Path $HtmlPath)) {
  throw "HTML non trovato: $HtmlPath"
}

$browser = Find-BrowserExe
if (-not $browser) {
  throw "Browser non trovato. Installa Microsoft Edge o Google Chrome, oppure indica un percorso manuale e rilancia."
}

# Percorsi assoluti
$HtmlFull = (Resolve-Path $HtmlPath).Path
$PdfFull  = $PdfPath

# Edge/Chrome headless print
Write-Host "Browser:" $browser
Write-Host "HTML   :" $HtmlFull
Write-Host "PDF    :" $PdfFull

& $browser `
  --headless=new `
  --disable-gpu `
  --no-first-run `
  --no-default-browser-check `
  --print-to-pdf="$PdfFull" `
  "$HtmlFull"

# Alcuni browser creano il PDF in modo asincrono: aspetta un attimo.
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  if (Test-Path $PdfFull) {
    try {
      $len = (Get-Item $PdfFull).Length
      if ($len -gt 0) { $ok = $true; break }
    } catch {}
  }
  Start-Sleep -Milliseconds 250
}

if (-not $ok) {
  throw "PDF non generato. Prova ad aprire l'HTML e stampare in PDF manualmente."
}

Write-Host "OK: PDF creato -> $PdfFull"


