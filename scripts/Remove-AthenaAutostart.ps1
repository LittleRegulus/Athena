$ErrorActionPreference = 'Stop'

$taskName = 'Athena Local Server'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Removed scheduled task: $taskName"
} else {
  Write-Output "Scheduled task is not installed: $taskName"
}
