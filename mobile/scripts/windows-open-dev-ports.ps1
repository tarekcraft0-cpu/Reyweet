# Opens inbound TCP ports for local Expo + Vite + API (Windows Firewall).
# Run from elevated PowerShell: Right-click PowerShell -> Run as administrator, then:
#   cd path\to\mobile
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows-open-dev-ports.ps1

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.BuiltInRole]::Administrator)) {
  Write-Host "This script must run as Administrator." -ForegroundColor Red
  exit 1
}

$ports = @(3077, 8081, 8788)
foreach ($port in $ports) {
  $name = "Retweet local dev TCP $port"
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Rule already exists: $name" -ForegroundColor DarkGray
    continue
  }
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port | Out-Null
  Write-Host "Created firewall rule: $name" -ForegroundColor Green
}

Write-Host "Done. Ports: $($ports -join ', ')" -ForegroundColor Green
