[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$')]
    [string]$CarIp,
    [Parameter(Mandatory = $true)]
    [string]$IdentityFile,
    [ValidateRange(10, 900)]
    [int]$DurationSeconds = 180,
    [string]$OutputFile = (Join-Path (Get-Location).Path ('seats-report-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.jsonl'))
)
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$address = $null
if (-not [System.Net.IPAddress]::TryParse($CarIp, [ref]$address)) { throw 'Invalid car IP address.' }
$key = (Resolve-Path -LiteralPath $IdentityFile).ProviderPath
if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw 'Use your existing SSH key file.' }
$report = [System.IO.Path]::GetFullPath($OutputFile)
if (Test-Path -LiteralPath $report) { throw 'Output file already exists. Choose another OutputFile.' }
$ssh = (Get-Command ssh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$script = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'collect-seats.js') -Raw -Encoding UTF8
$script = $script.Replace("`r", '') + "`n"
Write-Host ('Recording for ' + $DurationSeconds + ' seconds. No seat commands, settings changes or service restarts.')
Write-Host 'Reproduce: ignition off -> door open -> door closed -> ignition on. Stay parked.'
Write-Host ('Report: ' + $report)
$writer = New-Object System.IO.StreamWriter($report, $false, (New-Object System.Text.UTF8Encoding($false)))
$ErrorActionPreference = 'Continue'
try {
    $script | & $ssh -T -i $key -o BatchMode=yes -o ConnectTimeout=10 ('root@' + $CarIp) ('node - --seconds ' + $DurationSeconds) 2>&1 |
        ForEach-Object { $writer.WriteLine($_.ToString()); $writer.Flush() }
    $code = $LASTEXITCODE
} finally {
    $writer.Dispose()
    $ErrorActionPreference = 'Stop'
}
if ($code -ne 0) { throw ('SSH ended with exit ' + $code + '. The partial report was preserved: ' + $report) }
Write-Host ('Saved: ' + $report)
