param(
  [string]$Repo = "kazek5p-git/elradio-app",
  [string]$Branch = "main",
  [string]$IpaPath,
  [int]$MaxAttempts = 3,
  [int]$TimeoutSec = 180
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$iosRoot = "C:\Users\Kazek\Desktop\iOS"
$bridgePath = Join-Path $iosRoot "Install-IPA-Sideloadly-Bridge.ps1"
if (-not (Test-Path -LiteralPath $bridgePath)) {
  throw "Sideloadly bridge script not found: $bridgePath"
}

if ([string]::IsNullOrWhiteSpace($IpaPath)) {
  $buildRoot = Join-Path $repoRoot "Builds\Unsigned"
  $latestRoot = Join-Path $buildRoot "latest"
  New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $latestRoot | Out-Null

  $releaseIpa = Join-Path $latestRoot "EL-Radio-unsigned.ipa"
  $releaseOutput = & gh release download "latest-build" -R $Repo -p "EL-Radio-unsigned.ipa" -D $latestRoot --clobber 2>&1
  if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $releaseIpa)) {
    $IpaPath = $releaseIpa
    Write-Host "SOURCE: GitHub release latest-build"
  } else {
    Write-Host "Release download unavailable; falling back to workflow artifact lookup."
    if (-not [string]::IsNullOrWhiteSpace(($releaseOutput | Out-String).Trim())) {
      Write-Host ($releaseOutput | Out-String)
    }
  }
}

if ([string]::IsNullOrWhiteSpace($IpaPath)) {
  $buildRoot = Join-Path $repoRoot "Builds\Unsigned"
  $latestRoot = Join-Path $buildRoot "latest"
  $runJson = gh run list `
    -R $Repo `
    --workflow "iOS Unsigned IPA" `
    --branch $Branch `
    --status success `
    --limit 1 `
    --json databaseId,displayTitle,createdAt

  if ([string]::IsNullOrWhiteSpace($runJson)) {
    throw "No successful iOS Unsigned IPA run found for $Repo on branch $Branch."
  }

  $run = ($runJson | ConvertFrom-Json | Select-Object -First 1)
  if ($null -eq $run) {
    throw "No successful iOS Unsigned IPA run found for $Repo on branch $Branch."
  }

  $runDir = Join-Path $buildRoot ("run_" + $run.databaseId)
  if (Test-Path -LiteralPath $runDir) {
    Remove-Item -Recurse -Force -LiteralPath $runDir
  }
  New-Item -ItemType Directory -Force -Path $runDir | Out-Null

  gh run download $run.databaseId -R $Repo -n "EL-Radio-unsigned-ipa" -D $runDir | Out-Null

  $ipa = Get-ChildItem -Path $runDir -Recurse -File -Filter "*.ipa" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($null -eq $ipa) {
    throw "No IPA file found in downloaded artifact for run $($run.databaseId)."
  }

  $IpaPath = Join-Path $latestRoot "EL-Radio-unsigned.ipa"
  Copy-Item -Force -LiteralPath $ipa.FullName -Destination $IpaPath

  Write-Host ("RUN_ID: " + $run.databaseId)
  Write-Host ("RUN_TITLE: " + $run.displayTitle)
  Write-Host ("RUN_CREATED_AT: " + $run.createdAt)
}

if (-not (Test-Path -LiteralPath $IpaPath)) {
  throw "IPA not found: $IpaPath"
}

Write-Host ("LATEST_IPA: " + (Resolve-Path -LiteralPath $IpaPath).Path)
& $bridgePath -IpaPath (Resolve-Path -LiteralPath $IpaPath).Path -MaxAttempts $MaxAttempts -TimeoutSec $TimeoutSec
