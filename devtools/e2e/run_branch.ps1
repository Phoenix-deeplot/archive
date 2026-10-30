# Build the demo from a worktree, start the rig on it, run some tests, print the result lines.
#   powershell -File devtools/e2e/run_branch.ps1 -Tree E:\Ztree\wt\claude-player-fix -Tests s_playerside,s_player
# (the rig of the other worktree is stopped: there is one rig on one machine)
param([Parameter(Mandatory)][string]$Tree, [string[]]$Tests = @())
$E = Join-Path $Tree 'devtools\e2e'
python -X utf8 (Join-Path $E 'make_demo.py') --src $Tree --out (Join-Path $E '.demo') | Select-Object -Last 1
$R = Join-Path $E '.rig'; New-Item -ItemType Directory -Force -Path $R | Out-Null
$f = Join-Path $R 'rig.out'; Remove-Item $f -ErrorAction SilentlyContinue
Start-Process -FilePath powershell -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + (Join-Path $E 'rig.ps1')) -WindowStyle Hidden -RedirectStandardOutput $f -RedirectStandardError (Join-Path $R 'rig.err')
for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; if ((Test-Path $f) -and ((Get-Content $f -Raw) -match '9445 : (True|False)')) { break } }
'rig: ' + ((Get-Content $f) -join ' ')
Set-Location $E
foreach ($t in ($Tests | ForEach-Object { $_ -split ',' })) {
    "=== $t"
    $o = node "tests\$t.js" 2>&1 | Out-String -Stream
    $o | Where-Object { $_ -match '^FAIL|passed,|CRASH|^Error' } | ForEach-Object { if ($_.Length -gt 320) { $_.Substring(0, 320) } else { $_ } }
}
