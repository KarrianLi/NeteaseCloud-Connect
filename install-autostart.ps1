$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startup "NeteaseRemote.lnk"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnkPath)
$sc.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$sc.Arguments = '"' + (Join-Path $root "start-hidden.vbs") + '"'
$sc.WorkingDirectory = $root
$sc.Description = "Netease Remote (auto start)"
$sc.Save()
Write-Host "[OK] startup shortcut: $lnkPath"
