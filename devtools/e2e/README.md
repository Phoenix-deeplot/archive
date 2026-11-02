# Browser tests (end to end)

Headless Edge, driven over the DevTools protocol (`cdp.js`, Node 22+, nothing to install), against a demo build of the page and a few fake services. Meant to be used by every agent that changes the page.

```
python -X utf8 devtools/e2e/make_demo.py            build the demo from this folder   (--src <folder> to test another worktree)
powershell -File devtools/e2e/rig.ps1                start the demo (8820), the fake services (8840–8850) and two browsers (9444, 9445)
node devtools/e2e/tests/s_listen.js                  run one test (it prints PASS / FAIL lines and "N passed, M failed")
powershell -File devtools/e2e/run_all.ps1            all of them, about 25 minutes (start it detached; the result is in .rig/all.out)
python -X utf8 devtools/e2e/books_preview.py         put the real picked books (shelf-directory's registry/books.json) into the demo directory, to look at them (a test that writes its own directory replaces them)
python -X utf8 devtools/e2e/dup_funcs.py             the page is ONE script: a function declared twice silently overrides the first (run it after every edit of index.html)
python -X utf8 devtools/e2e/syntax_check.py          the script of the page parses
```

- **Ports** are fixed in the tests: 8820, 8840–8843, 8850, 9444, 9445 (the range 8800–8899 and 9440–9449 belongs to Claude, see `AGENTS.md`). Two agents cannot run the rig at the same time on one machine until the tests take the ports from the environment.
- `E2E_SRC` (the folder under test), `E2E_DIST` (the demo to open), `E2E_SHOTS` (where screenshots go), `SHELF_DIRECTORY` (the folder of the directory service, for the fake `/api/listen`): see `paths.js`.
- **Fixtures**: `fixtures/demo-library` (a made-up library; the guide of the project is added to it), `fixtures/site.demo.json`, `fixtures/directory.base.json` (the made-up public directory; `dir_fixture.js` writes the one most tests use into the demo and a test may change it: listen, focus and more leave it changed, so they run last).
- **The services** (`services/`) are plain Python: `sync_dev.py` (the directory service: sync store, hot lists, `/api/listen` as `shelf-directory/listen.py` answers, switchable with `/__listen?mode=ok|down|junk|empty|real`), `feed_site.py` (a made-up blog; written again, its titles are "<name> 第 N 篇"), `feed_site_text.py`, `podcast_site.py` (episodes that really play), `read_site.py`.
- **Not moved yet**: the tests that need the PDF conversion demo (`s_pdfconv`, `s_convert`), the admin page fakes (`s_admin_*`), `s_feed`. They need fixtures that were not kept.
- **Known to fail** (they need the original fixtures, which were not kept; the page is not at fault): s_read (the log of the reading site, and a directory item it cannot find), s_reco (two checks of the rows of the recommended list: the made-up blog's text differs), s_sync check B (the name of the subscription), s_hotpage the country picker (it follows the browser's language header). Everything else passes (un_all.ps1).
- **Dates**: `s_first` and `s_dir` freeze the clock of the page (`FREEZE_DAY`, `FREEZE_AT`): "today's three" take the entries of the last 72 hours and the fixture's newest entry is from 2026-10-24.
