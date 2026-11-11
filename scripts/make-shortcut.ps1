# Creates "ToshiBuddy" shortcuts (snowflake icon) on the Desktop and in the
# Start menu that launch this project folder with its bundled Electron.
# Run by "Setup ToshiBuddy.cmd"; safe to run again after moving the folder.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $root 'assets\icon.ico'
if (-not (Test-Path $electron)) { throw "Electron is not installed yet (missing $electron). Run Setup ToshiBuddy.cmd." }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs')
)
foreach ($dir in $targets) {
  if (-not (Test-Path $dir)) { continue }
  $lnk = $shell.CreateShortcut((Join-Path $dir 'ToshiBuddy.lnk'))
  $lnk.TargetPath = $electron
  $lnk.Arguments = '"' + $root + '"'
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = 'ToshiBuddy desktop buddy'
  $lnk.Save()
  Write-Host "Shortcut created: $(Join-Path $dir 'ToshiBuddy.lnk')"
}
