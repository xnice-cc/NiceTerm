param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$InputJson,

  [string]$DatabasePath,
  [switch]$Replace,
  [switch]$DryRun,
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $repoRoot "src-tauri\Cargo.toml"

$cargoArgs = @(
  "run",
  "--manifest-path",
  $manifestPath,
  "--example",
  "import_quick_commands",
  "--",
  $InputJson
)

if ($DatabasePath) {
  $cargoArgs += @("--db", $DatabasePath)
}
if ($Replace) {
  $cargoArgs += "--replace"
}
if ($DryRun) {
  $cargoArgs += "--dry-run"
}
if ($NoBackup) {
  $cargoArgs += "--no-backup"
}

& cargo @cargoArgs
exit $LASTEXITCODE
