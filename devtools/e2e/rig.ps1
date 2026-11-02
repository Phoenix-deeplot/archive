# Start (or restart) everything the browser tests need, and wait until it answers:
#   8820 the demo site (.demo/dist)        8840 the fake services of the directory (sync_dev.py: /api/listen, /api/hot, /api/submit ...)
#   8841 a made-up blog   8842 a blog with text   8843 a podcast with sounds   8850 a site to read articles from
#   9444 and 9445 two headless Edge windows that the tests drive over the DevTools protocol
# Build the demo first:  python -X utf8 devtools/e2e/make_demo.py
# Stop everything:       powershell -File devtools/e2e/rig.ps1 -Stop
param([switch]$Stop)
$E = $PSScriptRoot
$appPort = if ($env:E2E_APP_PORT) { [int]$env:E2E_APP_PORT } else { 8820 }
$hotPort = if ($env:E2E_HOT_PORT) { [int]$env:E2E_HOT_PORT } else { 8840 }
$feedPort = if ($env:E2E_FEED_PORT) { [int]$env:E2E_FEED_PORT } else { 8841 }
$textPort = if ($env:E2E_TEXT_PORT) { [int]$env:E2E_TEXT_PORT } else { 8842 }
$podPort = if ($env:E2E_POD_PORT) { [int]$env:E2E_POD_PORT } else { 8843 }
$readPort = if ($env:E2E_READ_PORT) { [int]$env:E2E_READ_PORT } else { 8850 }
$cdpPort = if ($env:E2E_CDP_PORT) { [int]$env:E2E_CDP_PORT } else { 9444 }
$cdp2Port = if ($env:E2E_CDP2_PORT) { [int]$env:E2E_CDP2_PORT } else { 9445 }
$ports = $appPort, $hotPort, $feedPort, $textPort, $podPort, $readPort, $cdpPort, $cdp2Port
foreach ($pt in $ports) { Get-NetTCPConnection -State Listen -LocalPort $pt -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
if ($Stop) { 'stopped'; return }
$R = Join-Path $E '.rig'; New-Item -ItemType Directory -Force -Path $R | Out-Null
$dist = Join-Path $E '.demo\dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw 'no demo yet: run  python -X utf8 devtools/e2e/make_demo.py  first' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
Start-Sleep 1
Start-Process -FilePath python -ArgumentList "-m http.server $appPort --bind 127.0.0.1 --directory `"$dist`"" -WindowStyle Hidden -RedirectStandardError "$R\h$appPort.err" -RedirectStandardOutput "$R\h$appPort.log"
$svc = @(@('sync_dev.py', $hotPort), @('feed_site.py', $feedPort), @('feed_site_text.py', $textPort), @('podcast_site.py', $podPort), @('read_site.py', $readPort))
foreach ($s in $svc) { Start-Process -FilePath python -ArgumentList "-X utf8 `"$E\services\$($s[0])`" $($s[1])" -WindowStyle Hidden -RedirectStandardError "$R\$($s[0]).err" -RedirectStandardOutput "$R\$($s[0]).log" }
foreach ($pair in @(@($cdpPort, 'edge1'), @($cdp2Port, 'edge2'))) {
  Start-Process -FilePath $edge -ArgumentList "--headless=new --remote-debugging-port=$($pair[0]) --user-data-dir=`"$R\$($pair[1])`" --no-first-run --no-default-browser-check --disable-gpu --autoplay-policy=no-user-gesture-required --proxy-server=direct:// --proxy-bypass-list=* about:blank" -WindowStyle Hidden
}
$up = $false
for ($i = 0; $i -lt 40 -and -not $up; $i++) { Start-Sleep 1; $up = -not ($ports | Where-Object { -not (Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue) }) }
foreach ($pt in $ports) { "$pt : " + [bool](Get-NetTCPConnection -State Listen -LocalPort $pt -ErrorAction SilentlyContinue) }
