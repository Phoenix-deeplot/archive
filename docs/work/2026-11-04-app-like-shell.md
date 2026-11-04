# 页面壳子秒开、回到应用自动更新、快速集再提速（2026-11-04）

状态：已合并（2026-11-04，用户说“除了小程序不合并，其他都合并”）；未推送、未部署

## 1. 任务清单（用户）

- [ ] C：页面壳子秒开（`sw.js` 先用旧版再后台更新，有新版时弹提示）。
- [ ] D：回到应用时自动刷新、发现世界下拉刷新、“已更新”提示。
- [ ] 把快速集里剩下的五个测试（`s_mobile`、`s_first`、`s_readerui`、`s_lang`、`s_hot`）也换成安静等待，目标：`-Quick` 约 5 分钟。

## 2. 规划（Claude）

### 现状（查过）

- `sw.js` 对页面本身（`/`、`index.html`）和 `manifest.js/json/webmanifest` 用“网络优先”：先等网络，4 秒还没回来才给本机的副本。网络慢的时候，白屏要等到 4 秒；网络正常也要等一个来回（页面 271 KB 压缩后，约 1.2 秒）。
- 页面只在 https 上注册 `sw.js`，本地预览（`serve.py`）和测试都不注册，所以现在没有任何测试能覆盖 `sw.js`。
- 发现世界的目录、运营数据、热度只在“打开发现世界”和“热度超过 10 分钟再看”时才去核对；一直开着的页面（手机上放后台再切回来）不会自己更新。

### C. 页面壳子秒开（`sw.js` + 页面里一小段）

- **壳子**＝`/`、`/index.html`（不管后面带什么参数）、`manifest.js`、`manifest.json`。本机有副本就**立刻用副本回答**，同时在后台请求网络（`cache:'no-cache'`，绕开浏览器自己的 HTTP 缓存）：回来的内容和副本不一样才存下来，并发给所有打开的页面一条消息 `{type:'zt-shell-updated'}`。本机没有副本（第一次）→ 和现在一样走网络。
- 比较：两边都有 `etag` 就比 `etag`，否则比内容的 SHA-1。没变就什么都不做（不存、不发消息）。网络失败：什么都不做（不报错）。
- 页面收到消息 → 底部弹一个不会自己消失的小条“有新版本了　[刷新]　[✕]”；点“刷新”＝重新载入（这时 `sw.js` 给的已经是存好的新版）；点 ✕ 本次不再提醒。同一次打开只弹一次。
- 其他页面（书籍页、文章页等 SEO 静态页）、`vendor/`、`icons/`、文档：规则不变，**不动 `VERSION`**（动了会把用户已缓存的离线文档清掉）。
- 页面可以主动叫 `sw.js` 核对一次：`navigator.serviceWorker.controller.postMessage({type:'zt-check-shell'})`（D 用）。
- **可测试**：注册条件由“只有 https”改成“https，或者本机（localhost）并且浏览器里有 `localStorage['zt.sw']==='1'`”。正常用户和 `serve.py` 的行为不变。

### D. 回到应用自动更新、下拉刷新、“已更新”提示（页面）

- **回到应用**：页面从后台回到前台（`visibilitychange`），如果离开超过 10 分钟 → 叫 `sw.js` 核对壳子；若当前在发现世界，核对目录 + 运营数据（`loadDirectory(true)`，没变不重画）和热度（`loadHeat(true)`）。不到 10 分钟什么都不做（和热度原来的 10 分钟节流一致）。
- **下拉刷新**（手机，发现世界，页面在最顶端时下拉）：手指跟着出一个小提示条“下拉刷新 → 松开刷新 → 刷新中…”，超过 70px 松手就刷新（目录、运营数据、热度，并叫 `sw.js` 核对壳子）；不够就弹回去。只在发现世界、没有打开阅读页 / 对话框时才起作用；横向手势、已经在滚动的不拦。电脑上没有手势，靠下面的“刷新”按钮。
- **“已更新”提示**：发现世界标题下面一行小字“更新于 12:30　↻”（不是当天就写“11-03 12:30”），点“↻”就刷新；刷新中转圈，刷新后写“已更新 12:30”。时间＝最近一次成功核对网络的时间；还在用本机副本、网络还没回答时写副本的时间。出错且有副本：时间不变，不报错。
- 热榜页、听页自己有加载逻辑，这次不动，只管目录、运营数据、热度。

### E. 快速集的五个测试换成安静等待

- `s_mobile`（29 处 `sleep`）、`s_first`（23）、`s_readerui`（25）、`s_lang`（7）、`s_hot`（3）：把“等页面画完 / 等请求回来”的 `sleep(n)` 换成 `settle(n)`（上限不变），页面自己计时器相关的、故意等固定时间的保留 `sleep`。每个测试换完前后各跑几次，结果必须和基线一样。目标：`-Quick` 约 5 分钟（现在 7.4）。

### 不做（以后）

- 热榜 / 听页的下拉刷新、第一屏专用小目录文件、封面图缓存。
- 自动应用新版本（直接换页面）：会打断正在读的书，所以只提示。

### 接口约定

- `sw.js` → 页面：`{type:'zt-shell-updated'}`（壳子有新内容，已存好）。
- 页面 → `sw.js`：`{type:'zt-check-shell'}`（立刻核对壳子；有更新就回上面那条）。
- 页面里新增：`#newVer`（小条）、`#updNote`（更新时间 + ↻）、下拉提示条 `#pullHint`；语言词典新增词条（中英各一份，加在**一行新的** `Object.assign` 里，不往现有超长行里加词）。
- 本机缓存：`zt-dir` 里不新增；`sw.js` 的缓存名不变。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| C + D | claude | `claude/app-like-shell` · `E:\Ztree\wt\claude-app-like-shell` | `sw.js`、`index.html`（注册处、`loadDirectory` / `loadHeat` 旁、`renderDir` 里的一行、`<head>` 样式）、`devtools/e2e/tests/s_swkeep.js`（新）、`devtools/e2e/run_all.ps1`（列表）、README | 翻译词典里现有的超长单行；codex 的 worktree；没被跟踪的用户文件 |
| E | claude | `claude/test-settle2` · `E:\Ztree\wt\claude-test-settle2` | `devtools/e2e/tests/s_mobile.js`、`s_first.js`、`s_readerui.js`、`s_lang.js`、`s_hot.js`、`run_all.ps1`（只在 `$known` / 快速集说明处，如需要）、README | `index.html`、`sw.js` |

### 验收

- C + D 之后：重名函数、语法检查通过。
- `s_swkeep`（新，浏览器里真的注册 `sw.js`）：①第一次打开：壳子存进缓存；②第二次打开，网络把 `index.html` 拖住：页面仍然马上出来（走副本）；③改了 `index.html`（加一个标记）：再打开后，小条出现；点“刷新”后页面是新的；没改：没有小条、没有存新副本；④网络失败：用副本，没有错误；⑤`zt-check-shell` 消息：有更新才回 `zt-shell-updated`；⑥回到应用：离开不到 10 分钟不核对，超过才核对（用改页面可见性和时间模拟）；⑦下拉刷新：下拉不到 70px 弹回、不请求；超过 70px 松手：目录被重新请求；⑧“更新于”时间和 ↻；⑨在阅读页里下拉不触发；⑩正常用户（没有 `zt.sw` 标记的 localhost）不注册 `sw.js`。
- `s_dirkeep`、`s_dir`、`s_shell`、`s_first`、`s_mobile`、`s_hot` 不退步。
- E 之后：五个测试各自的检查项数与结果和换之前一样；`-Quick` 全部通过，记下用时。
- 整套 `run_all.ps1`（两个分支合并后）：0 个新的失败。

### 端口

- claude：8800–8899、9440–9449。两个分支的测试不同时跑（共用 8820 一套），预览用各自备用端口（C+D 8830、E 不需要预览）。

### 风险和要避开的冲突点

- 先用旧壳子：用户会在一次部署之后的第一次打开看到旧页面，第二次（或点小条）才是新的。这是这种做法的标准代价；小条就是为它准备的。
- `sw.js` 出错会让整个站打不开：所以任何一步失败都退回网络（`catch` 后 `fetch(req)`），壳子回答不出时不空白。
- 下拉手势和浏览器自带的下拉刷新、页面里的横向滑动冲突：只在页面最顶端、手指向下为主、发现世界里才接管；接管后 `preventDefault` 掉自带的。
- `index.html` 上 C + D 只碰注册处、`loadDirectory` / `loadHeat` 旁和一行 `renderDir`；Codex 的 `hot-seo-refresh` 在热榜相关函数，不重叠。

## 3. 进度

### claude

- **C + D（`claude/app-like-shell`，做完）**：`sw.js`：页面（`/`、`/index.html`，后面带什么都一样）和 `manifest.js` 先用本机的副本回答，同时 `cache:no-cache` 去核对，内容变了（先比 etag，不同再比 SHA-1）才存下来并给所有页面发 `zt-shell-updated`；第一次访问照常走网络；任何失败都退回副本 / 网络；页面可以发 `zt-check-shell` 叫它立刻核对；`VERSION` 没动。`index.html`：注册条件（https，或 localhost / 127.0.0.1 且 `localStorage['zt.sw']==='1'`）；`#newVer` 小条（刷新 / ✕，同一次打开只弹一次，点刷新前先存笔记）；离开超过 10 分钟再回到前台 → `appResume()`（叫 sw 核对 + 在发现世界里 `dirRefresh()`）；下拉刷新（手机、发现世界、页面在最顶端、竖向为主、超过 70px 松手，被动监听，`html.ptr` 关掉浏览器自带的下拉重载）；`#updNote`“已更新 12:30 ↻”（`state.dirAt`＝最近一次网络核对成功的时间，副本显示时先用副本的时间；更新中显示“更新中…”并转圈）；`loadDirectory(force)` 在 force 时也等热度。
- **`s_swkeep`（新，36 项）**：真的在测试浏览器里注册 `sw.js`：没有开关不注册；第一次访问存壳子；第二次由 sw 接管、manifest.js 也存下；没变 = 没有小条；变了 = 先给旧页面（证明没等网络）、小条出现、新页面已存好；✕ 关闭后同一页面不再出现；`zt-check-shell`；下一次打开是新页面；点“刷新”换上新页面；服务器 404 时用副本不报错；带参数的地址不另存；发现世界的更新时间、↻、离开 3 分钟不核对 / 11 分钟核对、没变不重画；手机下拉（短拉弹回、横滑不算、长拉松手刷新、不在最顶端不拦）。连跑 5 次稳定。结束时注销 worker、清缓存、还原 `index.html`，不影响后面的测试；它在整套里排最后。
- 过程中发现并改掉：“已更新”那一行最初占版面，把发现世界的标题撑高了 31px，`s_shell` 三项失败；改成挂在标题下面已有的空隙里（绝对定位，不占版面）后 76 项通过。
- **E（`claude/test-settle2`，做完）**：`s_mobile`、`s_first`、`s_readerui`、`s_lang`、`s_hot` 里加载页面和点击后加载东西的固定等待换成 `settle`（页面自己计时器的、滑动之间的间隔保留 `sleep`）；`s_hot` 的 5.5 秒改成“等到第一条订阅内容出现”。`settle.js` 改为从 `performance.timeOrigin + performance.now()` 读最后一次变化的时间（`s_first` 把页面的时钟冻结了，用 `Date` 的话“页面安静”的判断是错的）。快速集 7.4 → 6.2 分钟（`s_mobile` 58→44 秒、`s_lang` 31→14、`s_first` 64→32、`s_readerui` 39→25、`s_hot` 29→14），结果与之前一样；**目标是约 5 分钟，没有达到**：剩下的时间主要在 `s_dir`（78–99 秒）、`s_bookpaged`（63 秒）、`s_shell`（44–52 秒）这几个本身就在做事的测试里。

## 4. 合并记录

- 合并顺序（2026-11-04，`--no-ff`，没推送、没部署；用户说“除了小程序不合并，其他都合并”）：shelf-directory 仓库的 `codex/hot-seo-sources`；my-archive 仓库的 `codex/hot-seo-refresh` → `claude/test-settle2` → `claude/app-like-shell`。两个 Claude 分支合并前先并入最新 master（都没有冲突）；`codex/hot-seo-refresh` 合并时它在 11:57 又提交了一次（修热榜译题和说明文字重叠），一并进来了，它的 worktree 是干净的。合并 `index.html` 时用户没提交的百度验证那一行先 `git stash`、合并后 `git stash pop` 放回，现在仍是未提交状态。
- 合并后的测试结果：整套 `run_all.ps1`（在并入全部分支之后的 `claude/app-like-shell` 上跑，它的文件树和合并后的 master 完全一致）30 个测试、0 个新的失败、4 行已知失败（`s_read` 停在第 92 行、`s_reco` 两项、`s_sync` 的 B 项）、用时 24.0 分钟；另外 `s_shell` 76 项、`s_seo_sections` 39 项、Codex 的 `s_reader_usability` 12 项（接到 8820 / 9444 上跑）全部通过；Codex 的 `s_hotpage` 61 项在整套里通过。shelf-directory：全部 724 个单测里 723 个通过，1 个失败（`tests.test_hotdetail … test_diag_says_why_a_platform_cannot_be_reached_from_here`，知乎的 host 已经改成 `plink.anyfeeder.com` 而测试还写着 `news-at.zhihu.com`）在合并前的 master 上就一样失败，不是这次带来的。
- 删除的分支和 worktree：`claude/app-like-shell`（`E:\Ztree\wt\claude-app-like-shell`）、`claude/test-settle2`（`E:\Ztree\wt\claude-test-settle2`）、`codex/hot-seo-refresh`（`C:\Users\Wu\.codex\worktrees\hot-seo-refresh\my-archive`）；shelf-directory 的 `codex/hot-seo-sources`（`E:\Ztree\wt\codex-hot-seo-sources`）。
- 上线要用户做：my-archive 的 `vercel --prod`（页面和 `sw.js` 才会换；访问者部署后的第一次打开看到的还是旧页面，点底部的小条或再打开一次才是新的）；shelf-directory 要部署后热榜才有 App Store / Polymarket 和 502 的变化；X 来源要用户在服务端设 `X_BEARER_TOKEN`（密钥我不碰、也不进仓库）。
