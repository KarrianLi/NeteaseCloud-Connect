' Auto-start entry: run start.bat silently (no console window)
Dim fso, sh, dir
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run Chr(34) & dir & "\start.bat" & Chr(34) & " /quiet", 0, False
