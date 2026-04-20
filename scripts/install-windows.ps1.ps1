# Claude Code Counter — Windows Installer
# Run in PowerShell as Administrator:
#   .\install.ps1 -ExtensionId "YOUR_CHROME_EXTENSION_ID"

param(
    [Parameter(Mandatory=$false)]
    [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Claude Code Counter Installer" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "────────────────────────────────"

# Get extension ID
if (-not $ExtensionId) {
    Write-Host "Paste your Chrome extension ID (from chrome://extensions):" -ForegroundColor Yellow
    $ExtensionId = Read-Host
}

if (-not $ExtensionId) {
    Write-Error "Extension ID is required."
    exit 1
}

# Find Python
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
$PythonBin = if ($PythonCmd) { $PythonCmd.Source } else { $null }
if (-not $PythonBin) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
    $PythonBin = if ($PythonCmd) { $PythonCmd.Source } else { $null }
}
if (-not $PythonBin) {
    Write-Error "Python 3 not found. Please install from https://python.org"
    exit 1
}

Write-Host "  Python: $PythonBin" -ForegroundColor Green

# Install host script
$HostDir = "$env:USERPROFILE\.claude-counter"
New-Item -ItemType Directory -Force -Path $HostDir | Out-Null
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostScript = Join-Path $ScriptDir "..\native-host\claude_counter_host.py"
Copy-Item $HostScript "$HostDir\claude_counter_host.py" -Force
Write-Host "  Host: $HostDir\claude_counter_host.py" -ForegroundColor Green

# Create wrapper batch file
$WrapperPath = "$HostDir\run_host.bat"
@"
@echo off
"$PythonBin" "$HostDir\claude_counter_host.py" %*
"@ | Set-Content $WrapperPath

# Write manifest
$ManifestContent = @{
    name = "com.claudecounter.host"
    description = "Claude Code Counter native messaging host"
    path = $WrapperPath
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 5

$ManifestPath = "$HostDir\com.claudecounter.host.json"
Set-Content $ManifestPath $ManifestContent

# Register in Windows registry for Chrome
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.claudecounter.host"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath
Write-Host "  Registry: $RegPath" -ForegroundColor Green

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "  1. Open Chrome -> chrome://extensions"
Write-Host "  2. Enable 'Developer mode'"
Write-Host "  3. Click 'Load unpacked' -> select the 'extension' folder"
Write-Host ""
