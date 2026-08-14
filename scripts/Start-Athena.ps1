$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
$healthUrl = 'http://127.0.0.1:8787/api/health'

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
  if ($response.StatusCode -eq 200) {
    exit 0
  }
} catch {
  # Athena is not running yet.
}

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$dataDirectory = Join-Path $projectDirectory 'data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

$standardLog = Join-Path $dataDirectory 'athena-service.log'
$errorLog = Join-Path $dataDirectory 'athena-service.err.log'
$process = Start-Process `
  -FilePath $nodePath `
  -ArgumentList @('server/index.js') `
  -WorkingDirectory $projectDirectory `
  -WindowStyle Hidden `
  -RedirectStandardOutput $standardLog `
  -RedirectStandardError $errorLog `
  -Wait `
  -PassThru

exit $process.ExitCode
