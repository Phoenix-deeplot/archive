# Start (or restart) everything the browser tests need, and wait until it answers:
#   8820 the demo site (.demo/dist)        8840 the fake services of the directory (sync_dev.py: /api/listen, /api/hot, /api/submit ...)
#   8841 a made-up blog   8842 a blog with text   8843 a podcast with sounds   8850 a site to read articles from
#   9444 and 9445 two headless Edge windows that the tests drive over the DevTools protocol
# Build the demo first:  python -X utf8 devtools/e2e/make_demo.py
# Stop everything:       powershell -File devtools/e2e/rig.ps1 -Stop
param([switch]$Stop)
$E = $PSScriptRoot
$ports = 8820, 8840, 8841, 8842, 8843, 8850, 9444, 9445
foreach ($pt in $ports) { Get-NetTCPConnection -State Listen -LocalPort $pt -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
if ($Stop) { 'stopped'; return }
$R = Join-Path $E '.rig'; New-Item -ItemType Directory -Force -Path $R | Out-Null
$dist = Join-Path $E '.demo\dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw 'no demo yet: run  python -X utf8 devtools/e2e/make_demo.py  first' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
Start-Sleep 1
Start-Process -FilePath python -ArgumentList "-m http.server 8820 --bind 127.0.0.1 --directory `"$dist`"" -WindowStyle Hidden -RedirectStandardError "$R\h8820.err" -RedirectStandardOutput "$R\h8820.log"
$svc = @(@('sync_dev.py', 8840), @('feed_site.py', 8841), @('feed_site_text.py', 8842), @('podcast_site.py', 8843), @('read_site.py', 8850))
foreach ($s in $svc) { Start-Process -FilePath python -ArgumentList "-X utf8 `"$E\services\$($s[0])`" $($s[1])" -WindowStyle Hidden -RedirectStandardError "$R\$($s[0]).err" -RedirectStandardOutput "$R\$($s[0]).log" }
foreach ($pair in @(@(9444, 'edge1'), @(9445, 'edge2'))) {
  Start-Process -FilePath $edge -ArgumentList "--headless=new --remote-debugging-port=$($pair[0]) --user-data-dir=`"$R\$($pair[1])`" --no-first-run --no-default-browser-check --disable-gpu --autoplay-policy=no-user-gesture-required --proxy-server=direct:// --proxy-bypass-list=* about:blank" -WindowStyle Hidden
}
$up = $false
for ($i = 0; $i -lt 40 -and -not $up; $i++) { Start-Sleep 1; $up = -not ($ports | Where-Object { -not (Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue) }) }
foreach ($pt in $ports) { "$pt : " + [bool](Get-NetTCPConnection -State Listen -LocalPort $pt -ErrorAction SilentlyContinue) }
