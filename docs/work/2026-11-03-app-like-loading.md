# “发现世界”像 app 一样打开：本机留一份、先显示再更新、提前开始下载（2026-11-03）

状态：已合并（2026-11-04，用户说“合并”）；未推送、未部署。C（页面壳子秒开）和 D（回到应用刷新 / 下拉刷新 / “已更新”提示）还没做

## 1. 任务清单（用户）

- [ ] “发现世界”每次打开都要加载很久；想要预加载、缓存加刷新机制，用起来像 app。

## 2. 规划（Claude）

### 现状（查过、量过）

- 从这台电脑直连量到：页面 `index.html` 271 KB 约 1.2 秒；`directory.json`（914 条）221 KB 约 0.7–1.0 秒；`/api/ops?public=1` 21 KB 约 1.0 秒；`/api/stat`、`/api/hot` 各约 0.5 秒。慢网和手机会放大几倍。
- `loadDirectory` 先等 `directory.json`（另一个域名，`cache:'no-cache'`，每次都要问服务器），再串着等 `/api/ops`（`applyPublicOps` 要靠它隐藏条目），两个都回来才画第一屏；本机不留任何副本。
- 离线缓存（`sw.js`）不管别的域名和 `/api/`，所以目录、运营数据、热度什么都不会留下。
- 请求要等 850 KB 的大脚本解析完、`boot()` 走到 `loadDirectory()` 才开始发。
- `<head>` 里 Google 字体的样式表是挡住首屏的（`rel="stylesheet"`）。

### 做什么

**A. 本机留一份，先显示再更新**

- 目录（`directory.json` 的原文）、运营数据（`/api/ops` 的 `data`）、热度（`/api/stat` 的 `items`、`shelves`）用 Cache API 存一份（缓存名 `zt-dir`，一份条目带版本号 `v`、目录地址 `base`、时间 `at`、目录原文 `dirText`、`ops`），热度单独一条（小，常换）。
- 打开时：本机有副本 → 马上用它建出 `state.dirData`（包括运营数据：被隐藏的条目第一屏就不出现）并画出来，**不等网络**；网络回来后，目录和运营数据都没变就什么都不动（不闪），变了就换上新的并重画，同时更新本机副本。
- 本机没有副本（第一次）→ 和现在一样，等网络，显示加载状态。
- 网络失败：有副本就继续用副本（不显示错误）；没有副本才显示现在的错误和重试。
- 副本格式不对（版本号、地址不一致或解析失败）→ 丢掉，当作第一次。
- 把 `loadDirectory` 里“洗数据 + 准备”那一大段拆成 `dirBuild(raw, ops)`，网络和本机副本走同一条路，不会出现两种不一样的数据。

**B. 提前开始下载**

- 在 `manifest.js` 之后、850 KB 大脚本之前放一小段脚本：知道目录地址（`ARCHIVE_MANIFEST.directory`）就立刻 `fetch` 目录和 `<目录地址>/api/ops?public=1`（并行），结果放在 `window.__early`；`loadDirectory` 来取（地址对得上才用，对不上就按原来的路重新请求）。
- 运营数据不再串在目录后面（有本机副本时用副本里的 `submit_api` 算地址；第一次靠上面的“猜”，猜错了回到串行）。
- Google 字体样式表改成不挡首屏（`preload` + `onload` 换成样式表，`<noscript>` 兜底），字体没到前用系统字体，到了再换（`display=swap` 本来就有）。阅读页里那个 iframe 文档有严格的内容安全策略，不能用这个办法，这次不动。

### 不做（以后）

- 页面壳子的离线缓存策略（C）、回到应用刷新 / 下拉刷新 / “已更新”提示（D）、第一屏专用的小目录文件、封面图缓存（跨域图片放进缓存要占很大的配额，不推荐）。

### 接口约定

- 没有对外接口变化。本机新增 Cache：`zt-dir`（`https://dir.cache/<目录地址>` = 目录和运营数据，`https://dir.cache/heat/<目录地址>` = 热度）。
- 副本里存的是网络原文，所以以后目录格式加字段，`dirBuild` 照常处理；改了 `dirBuild` 对数据的理解而旧副本会出问题时，把 `DIR_KEEP_V` 加一。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| A + B | claude | `claude/app-like-loading` · `E:\Ztree\wt\claude-app-like-loading` | `index.html`（`loadDirectory`、`loadHeat`、`<head>`、`manifest.js` 后的小脚本）、`devtools/e2e/tests/s_dirkeep.js`（新）、`run_all.ps1`、README | 翻译词典那几行超长的单行；没被跟踪的用户文件；codex 的 worktree |

### 验收

- 重名函数、语法检查通过。
- `s_dirkeep`（新）：①第一次打开：目录走网络，本机留下副本；②第二次打开，目录请求被拖住：点“发现世界”马上有卡片（请求还在路上）；③目录变了：网络回来后新条目出现、副本更新；没变：页面不重画；④网络失败：用副本，没有错误状态；⑤副本损坏或版本不对：忽略；⑥被运营隐藏的条目第一屏就不出现；⑦热度副本：第一屏就有喜欢数；⑧提前下载：打开时目录只请求一次。
- `s_dir`、`s_first`、`s_shell`、`s_sections`、`s_hotpage`、`s_hot`、`s_sync`（原有的一项失败不算）、`s_mobile` 不退步。
- 预览：8820 端口。用人为变慢的网络（浏览器开发者工具的“慢速 3G”）比较第一次和第二次打开“发现世界”。

### 端口

- claude：8800–8899、9440–9449。

### 风险和要避开的冲突点

- 第一屏用的是旧数据：运营数据（被隐藏的条目）一起存、一起用；格式带版本号。
- 更新到了别让列表突然跳：没变不重画；变了才重画，保持滚动位置。
- `loadDirectory` 的返回时机（启动后面一串事情等它）保持：副本显示后仍等网络那一步结束才继续。
- 这一段 `index.html` 是 Codex 刚合并过的热榜 / 发现页旁边：只改 `loadDirectory`、`loadHeat` 和启动处，不碰别的函数。

## 3. 进度

### claude

- **A + B（做完，待预览）**：分支 `claude/app-like-loading`。`index.html`：①`dirBuild(d, ops)`（原来 `loadDirectory` 里“洗数据 + 准备”那一段，网络和本机副本共用）；②本机副本 `dirKeptGet` / `dirKeptPut`（Cache API `zt-dir`，版本 `DIR_KEEP_V`、地址 `base`、30 天过期；目录原文 + 运营数据一条，热度单独一条）；③`loadDirectory`：没数据时先读副本、建好就画（并立刻开始取热度），再等网络；网络回来的原文和运营数据与已显示的一样就什么都不做（`state.dirSrc` 比对），不一样才 `dirBuild` 重画并更新副本；运营服务没回答就沿用已知的运营数据；网络失败有数据就不报错；`state.dirBusy` 取代原来用 `dirState==='loading'` 当锁；④`loadHeat`：存副本，数字没变不重画；⑤`manifest.js` 后的小脚本 `window.__early`：知道目录地址就并行请求 `directory.json` 和（https 时）`/api/ops?public=1`，`loadDirectory` 取用（运营地址对得上才用）；⑥Google 字体样式表改成 `preload` + `onload`，`<noscript>` 兜底。`devtools/e2e/tests/s_dirkeep.js` 20 项（第一次、再次打开时目录被拖住、没变不重建、变了换上、网络失败、四种坏副本、运营数据隐藏、热度副本、请求只发一次、字体样式表）。README 写了。和规划一致，没有改别的函数。

- 合并顺序：
- 合并后的测试结果：
- 删除的分支和 worktree：

## 4. 合并记录

- 合并顺序（2026-11-04，`--no-ff`，没推送、没部署）：`claude/ignore-noise` → `claude/test-speed` → `claude/test-settle` → `claude/app-like-loading`；每个分支合并前先并入最新 master（只有 `app-like-loading` 有一处冲突：`run_all.ps1` 里测试列表那一行，取 master 的新版本再把 `s_dirkeep` 加进整套列表）。
- 合并后的测试结果：整套 `run_all.ps1`（在并入全部三个先合的分支之后的 `app-like-loading` 上跑）29 个测试、0 个新的失败、4 行已知失败（`s_read` 停在第 92 行、`s_reco` 两项、`s_sync` 的 B 项）、用时 24.6 分钟；Codex 的 `s_reader_usability` 12 项通过；合并到 master 之后的快速集（`-Quick`）10 个测试全部通过，用时 7.4 分钟。这个分支自己的验证：`s_dirkeep` 20 项。
- 删除的分支和 worktree：`claude/app-like-loading` 和 `E:\\Ztree\\wt\\claude-app-like-loading`。
- 上线要用户做：`vercel --prod`（页面才有新的加载方式）；第一次打开还要等网络，从第二次起才是秒开。
