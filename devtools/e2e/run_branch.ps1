# Build the demo from a worktree, start the rig on it, run some tests, print the result lines.
#   powershell -File devtools/e2e/run_branch.ps1 -Tree E:\Ztree\wt\claude-player-fix -Tests s_playerside,s_player
# (the rig of the other worktree is stopped: there is one rig on one machine)
param([Parameter(Mandatory)][string]$Tree, [string[]]$Tests = @())
$E = Join-Path $Tree 'devtools\e2e'
$env:E2E_APP_PORT = if ($env:E2E_APP_PORT) { $env:E2E_APP_PORT } else { '8920' }
$env:E2E_HOT_PORT = if ($env:E2E_HOT_PORT) { $env:E2E_HOT_PORT } else { '8940' }
$env:E2E_FEED_PORT = if ($env:E2E_FEED_PORT) { $env:E2E_FEED_PORT } else { '8941' }
$env:E2E_TEXT_PORT = if ($env:E2E_TEXT_PORT) { $env:E2E_TEXT_PORT } else { '8942' }
$env:E2E_POD_PORT = if ($env:E2E_POD_PORT) { $env:E2E_POD_PORT } else { '8943' }
$env:E2E_READ_PORT = if ($env:E2E_READ_PORT) { $env:E2E_READ_PORT } else { '8950' }
$env:E2E_CDP_PORT = if ($env:E2E_CDP_PORT) { $env:E2E_CDP_PORT } else { '9450' }
$env:E2E_CDP2_PORT = if ($env:E2E_CDP2_PORT) { $env:E2E_CDP2_PORT } else { '9451' }
$appPort = [int]$env:E2E_APP_PORT
python -X utf8 (Join-Path $E 'make_demo.py') --src $Tree --out (Join-Path $E '.demo') --site-url "http://127.0.0.1:$appPort" | Select-Object -Last 1
$R = Join-Path $E '.rig'; New-Item -ItemType Directory -Force -Path $R | Out-Null
$f = Join-Path $R 'rig.out'; Remove-Item $f -ErrorAction SilentlyContinue
Start-Process -FilePath powershell -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + (Join-Path $E 'rig.ps1')) -WindowStyle Hidden -RedirectStandardOutput $f -RedirectStandardError (Join-Path $R 'rig.err')
for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; if ((Test-Path $f) -and ((Get-Content $f -Raw) -match ([regex]::Escape($env:E2E_CDP2_PORT) + ' : (True|False)'))) { break } }
'rig: ' + ((Get-Content $f) -join ' ')
Set-Location $E
foreach ($t in ($Tests | ForEach-Object { $_ -split ',' })) {
    "=== $t"
    $o = node "tests\$t.js" 2>&1 | Out-String -Stream
    $o | Where-Object { $_ -match '^FAIL|passed,|CRASH|^Error' } | ForEach-Object { if ($_.Length -gt 320) { $_.Substring(0, 320) } else { $_ } }
}
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $E 'rig.ps1') -Stop
