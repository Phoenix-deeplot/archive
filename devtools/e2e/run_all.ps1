# Run every browser test, one after the other, on a fresh rig; write the result to .rig/all.out. Takes about 25 minutes: start it detached
# (Start-Process powershell -ArgumentList '-NoProfile -File devtools/e2e/run_all.ps1' -WindowStyle Hidden) and read .rig/all.out when it says "done".
# The tests that change the made-up directory (listen, focus, more) run last: the ones before them expect it as the fixture writes it.
param([string[]]$Only = @())
$E = $PSScriptRoot
Set-Location $E
$R = Join-Path $E '.rig'; New-Item -ItemType Directory -Force -Path $R | Out-Null
$out = Join-Path $R 'all.out'
'' | Set-Content $out -Encoding UTF8
function Log($s) { Add-Content $out $s -Encoding UTF8 }
function Rig {                                                          # (the browsers keep the output pipe of whoever starts them: the output goes to a file, and this waits for the ports)
    $f = Join-Path $R 'rig.out'; Remove-Item $f -ErrorAction SilentlyContinue
    Start-Process -FilePath powershell -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + (Join-Path $E 'rig.ps1')) -WindowStyle Hidden -RedirectStandardOutput $f -RedirectStandardError (Join-Path $R 'rig.err')
    for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; if ((Test-Path $f) -and ((Get-Content $f -Raw) -match '9445 : (True|False)')) { break } }
    Log ('rig: ' + ((Get-Content $f) -join ' '))
}
Log ('start ' + (Get-Date))
Rig
$all = 's_read', 's_lang', 's_starter', 's_mobile', 's_reco', 's_readerui', 's_backup', 's_text', 's_sync', 's_notes', 's_notes_doc', 's_first', 's_dir', 's_hot', 's_hotpage', 's_rich', 's_tips', 's_player', 's_player2', 's_listen', 's_focus', 's_more', 's_books', 's_bookcache', 's_bookreader', 's_bookcards', 's_booktrans'
$list = if ($Only.Count) { $Only } else { $all }
foreach ($f in $list) {
    $o = node "tests\$f.js" 2>&1
    Log ("{0}: {1}" -f $f, (($o | Select-String 'passed,') -join ''))
    ($o | Select-String '^FAIL|CRASH') | ForEach-Object { Log ('   ' + $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length))) }
    if ($f -eq 's_starter' -or $f -eq 's_sync') { Rig }                  # (these change the recommended list / the sync store: the later ones start from a fresh rig)
}
Log ('done ' + (Get-Date))
