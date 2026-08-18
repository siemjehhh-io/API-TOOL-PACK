#!/usr/bin/env pwsh
# Rename Tailwind v4 spacing utilities to use ds- prefix.
# Fixes collision: --spacing-md was overriding max-w-md (28rem -> 1rem),
# breaking shadcn/ui dialogs (visible as thin vertical line bug).

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$files = @(
  "artifacts/wd-data-extractor/src/pages/home.tsx",
  "artifacts/wd-data-extractor/src/pages/dp-section.tsx",
  "artifacts/wd-data-extractor/src/pages/GigaCopyDpHoki.tsx",
  "artifacts/wd-data-extractor/src/pages/GigaCopyDpZenpay.tsx",
  "artifacts/wd-data-extractor/src/pages/GigaCopyBonus.tsx",
  "artifacts/wd-data-extractor/src/pages/GigaSmartMutasi.jsx"
)

# Match: (prefix)-(token) where prefix is a spacing utility and token is in our scale.
# \b at start ensures we don't match in the middle of a word (e.g. 'flex-gap-md' won't match)
# \b at end ensures token is followed by non-word (space, quote, etc.)
$pattern = '\b(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(xs|sm|md|lg|xl|xxl)\b'

$totalChanges = 0
foreach ($rel in $files) {
  $path = Join-Path $root $rel
  if (-not (Test-Path $path)) {
    Write-Host "SKIP (not found): $rel" -ForegroundColor Yellow
    continue
  }
  $content = Get-Content $path -Raw
  $matchCount = ([regex]::Matches($content, $pattern)).Count
  if ($matchCount -eq 0) {
    Write-Host "0 changes : $rel" -ForegroundColor Gray
    continue
  }
  $newContent = [regex]::Replace($content, $pattern, '$1-ds-$2')
  Set-Content -Path $path -Value $newContent -NoNewline -Encoding UTF8
  Write-Host "$matchCount changes : $rel" -ForegroundColor Green
  $totalChanges += $matchCount
}

Write-Host ""
Write-Host "Total replacements: $totalChanges" -ForegroundColor Cyan
