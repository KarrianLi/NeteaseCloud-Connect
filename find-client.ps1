$ErrorActionPreference = "SilentlyContinue"

# 1) explicit override
if ($env:CLOUDMUSIC_EXE -and (Test-Path $env:CLOUDMUSIC_EXE)) {
    Write-Output $env:CLOUDMUSIC_EXE
    exit 0
}

# 2) protocol registration (client registers orpheus:// on install)
$entry = Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\orpheus\shell\open\command"
if ($entry) {
    $cmd = $entry."(default)"
    if ($cmd) {
        $m = [regex]::Match($cmd, '"([^"]+\.exe)"')
        if ($m.Success -and (Test-Path $m.Groups[1].Value)) {
            Write-Output $m.Groups[1].Value
            exit 0
        }
    }
}

# 3) common install locations
$pf = $env:ProgramFiles
$pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
$candidates = @(
    (Join-Path $pf "Netease\CloudMusic\cloudmusic.exe"),
    (Join-Path $pf "NeteaseCloudMusic\cloudmusic.exe"),
    (Join-Path $pf86 "Netease\CloudMusic\cloudmusic.exe"),
    (Join-Path $env:LOCALAPPDATA "Netease\CloudMusic\cloudmusic.exe"),
    (Join-Path $env:APPDATA "Netease\CloudMusic\cloudmusic.exe")
)
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { Write-Output $c; exit 0 }
}

# 4) scan drive roots for CloudMusic folder
foreach ($drv in (Get-PSDrive -PSProvider FileSystem)) {
    $p = Join-Path $drv.Root "CloudMusic"
    $exe = Join-Path $p "cloudmusic.exe"
    if (Test-Path $exe) { Write-Output $exe; exit 0 }
}

exit 1
