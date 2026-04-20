# Claude Code Counter - Windows Uninstaller
# Run in PowerShell:
#   .\uninstall-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Claude Code Counter Uninstaller" -ForegroundColor White
Write-Host "────────────────────────────────"

# Remove host files
$HostDir = "$env:USERPROFILE\.claude-counter"
if (Test-Path $HostDir) {
    Remove-Item -Recurse -Force $HostDir
    Write-Host "  Removed $HostDir" -ForegroundColor Green
} else {
    Write-Host "  $HostDir not found, skipping" -ForegroundColor Yellow
}

# Remove registry entry
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.claudecounter.host"
if (Test-Path $RegPath) {
    Remove-Item -Path $RegPath -Force
    Write-Host "  Removed registry entry" -ForegroundColor Green
} else {
    Write-Host "  Registry entry not found, skipping" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Remove the extension from chrome://extensions to finish." -ForegroundColor Green
Write-Host ""
