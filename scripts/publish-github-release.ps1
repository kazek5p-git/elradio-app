param(
  [string]$Repo = "kazek5p-git/elradio-app",
  [string]$Tag,
  [string]$Notes = "EL Radio Android build.",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Invoke-Tool {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Command,
    [string]$WorkingDirectory
  )

  if ($WorkingDirectory) {
    Push-Location $WorkingDirectory
  }

  try {
    & $Command[0] $Command[1..($Command.Length - 1)]
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $($Command -join ' ')"
    }
  } finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidDir = Join-Path $repoRoot "android"

if ([string]::IsNullOrWhiteSpace($Tag)) {
  $package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
  $Tag = "v$($package.version)"
}

if (-not $SkipBuild) {
  Invoke-Tool -Command @("npx", "expo", "prebuild", "--platform", "android") -WorkingDirectory $repoRoot
  $env:NODE_ENV = "production"
  Invoke-Tool -Command @(".\gradlew.bat", ":app:assembleRelease", "-x", "lintVitalAnalyzeRelease", "-x", "lintVitalRelease", "-x", "lint") -WorkingDirectory $androidDir
}

$apk = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path -LiteralPath $apk)) {
  throw "APK not found: $apk"
}

$assetRoot = Join-Path $repoRoot "Builds\Android"
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
$assetPath = Join-Path $assetRoot "EL-Radio-$Tag.apk"
Copy-Item -Force -LiteralPath $apk -Destination $assetPath

$existing = gh release view $Tag -R $Repo --json tagName 2>$null
if ([string]::IsNullOrWhiteSpace($existing)) {
  gh release create $Tag $assetPath -R $Repo --title "EL Radio $Tag" --notes $Notes
} else {
  gh release upload $Tag $assetPath -R $Repo --clobber
}

Write-Host "RELEASE_TAG: $Tag"
Write-Host "APK_ASSET: $assetPath"
