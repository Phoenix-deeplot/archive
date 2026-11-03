# Run the browser tests, one after the other, on a fresh rig; write the result to .rig/all.out (every line says how long the test took). The whole list takes about 25-40 minutes: start it detached
# (Start-Process powershell -ArgumentList '-NoProfile -File devtools/e2e/run_all.ps1' -WindowStyle Hidden) and read .rig/all.out when it says "done".
#   -Quick          the short list for every day (about 5 minutes): what a change of the page can break, without the tests that restart the rig, change the made-up directory or are known to fail
#   -Only a,b       just these          -Skip a,b       the list (all, or the quick one) without these
# The tests that change the made-up directory (listen, focus, more) run last: the ones before them expect it as the fixture writes it.
param([string[]]$Only = @(), [switch]$Quick, [string[]]$Skip = @())
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
# Failures that were there before and are not the page's fault. They still run (most of their checks are good); a failing line that matches is written as "known" and counted apart, so that a new failure is not lost among them.
# One row: the test, a pattern for the line (the text of the check, or "no result" when the test does not finish), and why. Take a row out when it is fixed.
$known = @(
    @{ test = 's_read';   match = 'pages were asked for honestly'; why = 'the log of the reading site also holds what the tests before it asked for' },
    @{ test = 's_read';   match = 'no result';                     why = 'stops where it looks for the card of a directory article it added: the page that opens has no such card (line 92)' },
    @{ test = 's_reco';   match = 'a row: name linking';           why = 'the text of the made-up blog differs from what the check expects' },
    @{ test = 's_reco';   match = 'an item the directory lists already'; why = 'the same' },
    @{ test = 's_sync';   match = 'B: the collection, its member'; why = 'the name of the subscription differs from what the check expects' },
    @{ test = 's_mobile'; match = 'publication date';              why = 'a counter of the fake stat service left by a test before it (it passes on a fresh rig, or after /__stat_reset?off=0)' }
)
$all = 's_read', 's_lang', 's_starter', 's_mobile', 's_reco', 's_readerui', 's_backup', 's_text', 's_sync', 's_notes', 's_notes_doc', 's_first', 's_dir', 's_hot', 's_hotpage', 's_rich', 's_tips', 's_player', 's_player2', 's_listen', 's_focus', 's_more', 's_books', 's_bookcache', 's_bookreader', 's_bookcards', 's_booktrans', 's_bookpaged'
$quickList = 's_mobile', 's_lang', 's_first', 's_readerui', 's_text', 's_dir', 's_shell', 's_hot', 's_dirkeep', 's_bookpaged'          # (s_mobile first: it wants a rig that nothing has counted on yet)
$list = if ($Only.Count) { $Only } elseif ($Quick) { $quickList } else { $all }
$list = @($list | ForEach-Object { $_ -split ',' } | Where-Object { $_ })                       # ("-File ... -Only a,b" gives one string "a,b")
$skipped = @($Skip | ForEach-Object { $_ -split ',' } | Where-Object { $_ }); $list = @($list | Where-Object { $skipped -notcontains $_ })
Log ('start ' + (Get-Date) + $(if ($Quick) { '  (quick list)' } elseif ($Only.Count) { '  (only: ' + ($list -join ', ') + ')' } else { '' }))
Rig
$clock = [Diagnostics.Stopwatch]::StartNew(); $times = @{}; $new = 0; $old = 0; $ran = 0
foreach ($f in $list) {
    if (-not (Test-Path (Join-Path $E "tests\$f.js"))) { Log ("{0}: not in this folder (left out)" -f $f); continue }
    $t = [Diagnostics.Stopwatch]::StartNew()
    $o = node "tests\$f.js" 2>&1
    $t.Stop(); $times[$f] = [int]$t.Elapsed.TotalSeconds; $ran++
    $res = (($o | Select-String 'passed,') -join '')
    Log ("{0}: {1}  ({2} s)" -f $f, $res, $times[$f])
    $lines = @($o | Select-String '^FAIL|CRASH' | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) })
    if (-not $res -and -not $lines.Count) { $lines = @('no result: the test did not finish') }
    foreach ($l in $lines) {
        $k = $known | Where-Object { $_.test -eq $f -and $l -match $_.match } | Select-Object -First 1
        if ($k) { $old++; Log ('   known (' + $k.why + '): ' + $l) } else { $new++; Log ('   ' + $l) }
    }
    if ($f -eq 's_starter' -or $f -eq 's_sync') { Rig }                  # (these change the recommended list / the sync store: the later ones start from a fresh rig)
}
$slow = ($times.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5 | ForEach-Object { '{0} {1} s' -f $_.Key, $_.Value }) -join ', '
Log ('summary: {0} tests, {1} new failing lines, {2} known failing lines' -f $ran, $new, $old)
Log ('slowest: ' + $slow)
Log ('done ' + (Get-Date) + ('  (in {0:N1} minutes)' -f $clock.Elapsed.TotalMinutes))
