# 阅读体验：读书模式、翻页、精选图书卡片、按需翻译（2026-11-02）

状态：**已确认（2026-11-02，用户：“建议可以”）**，按下面做 R1–R4；用户 11-02 补充：①**目录（章节标题 / 文章目录）也要能翻译**；②系列 / 合集以后在运营后台里设置，现在不做；③新增一块“共享内容缓存”（R0，先做）：用户 11-02 定了——精品书长期存 PostgreSQL，临时 / 冷门 / 变化快的放 Redis，具体按浏览习惯由 Claude 设计；先只存图书和书单，以后用户会爬取或手动添加书。

## 1. 任务清单（用户）

- [ ] 让阅读器像市场上好的阅读器那样，在电脑和手机上都能好好读书：翻页、切换章节等，尤其是精选图书。
- [ ] 用户 11-02 确认的做法：**三步都做**（读书模式 → 可选翻页 → 精选图书卡片 + 按需翻译），**Claude 一个人做，一步一步合并**；**书单补章节标题**（可选字段）。
- [ ] 参考用户贴来的建议（翻译按需限范围、手机翻译入口前置、默认连续滚动、精选图书卡片/列表优化、系列合集后做）。

## 2. 规划（Claude）

### 定下来的原则

- **只改“书”的体验，不动别的页面**：新行为都由“这是精选图书的一章”（阅读项里有 `bookOf`）或“这是精选图书的卡片”（`type=book` 且有 `license`）触发；热榜、今日听什么、我的书架、普通文章的阅读行为保持原样。
- **默认连续滚动**；翻页是 `Aa` 里的可选开关，默认关；结构复杂的章（表格 / 图片多）自动退回滚动。
- **翻译只在点了以后才发**，范围只有：标题、简介、目录（章节标题 / 文章里的小标题目录）、当前章节正文；不翻译作者、标签、导航、代码。书的卡片不自动翻译。目录很短、量小，点“翻译”时和正文一起翻，也可以单独只翻目录。
- **不推送、不部署**；每一步做完你预览，说“合并”再合并。
- 系列 / 合集**不做**：现有数据没有系列名和顺序，不能靠书名猜；以后在**运营后台**（`ops` 数据库）里管理图书时再设置，到时先约定字段和接口。
- 只改自己 worktree 里的文件，不碰没被跟踪的用户文件（`converted/`、`vendor/pdfjs/`、`convert.py`、`RSS_候选源清单…`、`devtools/netease-openapi-tester.html`）。

### 分步（每一步一个分支、一次合并）

| 步 | 内容 | my-archive 分支 · worktree | shelf-directory 分支 · worktree |
|---|---|---|---|
| R0 共享内容缓存 | 读过一次的章存到云端（Redis 热层 + PostgreSQL 长期层），再读的人直接取；本机再缓存一份；精选图书先做实验 | `claude/book-content-ui` · `E:\Ztree\wt\claude-book-content-ui` | `claude/book-content` · `E:\Ztree\wt\claude-book-content` |
| R1 读书模式 | 章节面板、章末“下一章”、预读、记住位置、读书排版选项、手机点中间显示/隐藏工具栏、书章里关掉侧滑换章 | `claude/reader-book-mode` · `E:\Ztree\wt\claude-reader-book-mode` | `claude/books-titles` · `E:\Ztree\wt\claude-books-titles`（章节标题） |
| R2 翻页模式 | `Aa` 里“滚动 / 翻页”开关；点左右两侧、滑动、← → / 空格翻页；页码；章末进下一章；宽屏双页；改字号不丢位置 | `claude/reader-paged` · `E:\Ztree\wt\claude-reader-paged` | 无 |
| R3 精选图书卡片 | 书封（有封面图用图，没有就生成带书名和作者的文字书封）、卡片显示书名 / 作者 / 2–3 行摘要 /“试读 · 继续阅读”；列表模式小封面 + 书名 + 作者 + 摘要 + 章数 | `claude/books-cards` · `E:\Ztree\wt\claude-books-cards` | 无 |
| R4 按需翻译 | “翻译本屏 / 翻译本章”；按段落缓存；手机浮动小按钮（只在能翻译且能站内读时出现）；书的窗口里“翻译简介” | `claude/reader-translate` · `E:\Ztree\wt\claude-reader-translate` | 无（服务端不改） |

顺序固定 R0 → R1 → R2 → R3 → R4；R1 里 shelf-directory 的书单标题和页面同批合并。每步的分支都从**上一步合并后的 master** 开。

### 会改的文件

- **my-archive**：`index.html`（阅读器：`openReader` / `openLinkReading` / `closeReader` / `step` / `buildToc` / `renderTocPanel` / `watchSwipe` / `docShell` / `docVars` / `Aa` 面板；书：`openBook` / `openBookChapter` / `bookItem`；卡片：`dirCardHTML` / `dirRowHTML` / `dirXCoverHTML` / `coverLook` / `dirMetaLine`；翻译：`trCache*` 和翻译按钮部分）；新词只用 `Object.assign(I18N.zh/en,{…})`，不往词典大行里加；`devtools/e2e/tests/s_bookreader.js`（R1，新）、`s_bookpaged.js`（R2，新）、`s_books.js`（R3 扩）、`s_translate.js`（R4 扩）、`devtools/e2e/services/read_site.py`（加带标题、很长的章节页，供测试）；`README.md`、本文件的进度。
- **shelf-directory（只 R1）**：`books_tool.py`（新增 `titles` 命令）、`aggregate.py`（`check_book` 认 `ch.t`）、`registry/books.json`（补标题）、`SHELF-SPEC.md`、`README.md`、`tests/test_books.py`。

### 不许碰

- 热榜页、今日听什么、我的书架布局、播放器；`translateapi.py` 和别的服务端文件；线上服务和环境变量；Codex 的文件。
- 页面是一个大函数：改完跑重名函数检查和语法检查。

### 接口约定

#### 共享内容缓存（R0，shelf-directory ↔ 页面）

读取顺序：**本机 → 云端（CDN / Redis / PostgreSQL）→ 原站**。读到的内容再按下面的规则存回去。

`GET /api/book?b=<书编号>&c=<章序号>`（只有一页的书 `c=0`）。服务端按 `registry/books.json` 自己拼章节地址，**不接受访客给的网址**，所以它不是通用代理，也存不进别的内容。

```json
成功：{"ok": true, "b": "hongloumeng", "c": 0, "title": "…", "content": "<清理过的安全 HTML>", "lang": "zh", "license": "public-domain",
       "source": "https://zh.wikisource.org/wiki/…", "by": "维基文库", "tier": "hot" | "durable" | "source", "v": 1}
失败：{"ok": false, "error": "nocache" | "unknown" | "unreadable" | "limit" | "busy", "message": "给读者看的一句话"}
```

- **授权闸门**：只有 `license` 是 `public-domain`、`cc0`、`cc-by`、`cc-by-sa` 的书才存到云端；别的（`cc-by-nc*`、`free-to-read`，以及书单里没写授权的）返回 `nocache`，页面退回现在的 `/api/feed read`，**只缓存在读者自己的浏览器里**。书单条目可选 `"share": false` 强制不共享。以后爬取或手动添加的书必须写 `license`，没写的不会进云端。
- **两层存储**（书单条目可选 `"keep": true`，“精品，长期保存”；现有 54 本都写 `true`，以后新加的默认 `false`）：
  - 热层 **Redis**：所有被读过的可共享章都在这里，`keep` 的存 14 天（过期了还能从 PostgreSQL 补回），其他的存 30 天后消失。
  - 长期层 **PostgreSQL**：`keep: true` 的书，第一次从原站读到就写进来，不过期；其他的书，**同一章被读满 5 次**（`BOOK_PROMOTE_READS`）也自动升到这里。冷门、变化快的内容不占长期层。
  - 读：CDN → Redis → PostgreSQL（命中就回填 Redis）→ 原站。没配 PostgreSQL 就只有 Redis；Redis 也没配就只靠 CDN 和本机，照样能读。
- **CDN**：成功的响应带 `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` 和 `Vary: Origin`，同一章被很多人读时连数据库都不用查；出错一律 `no-store`。
- **防护**：同一章第一次被很多人同时读时，只放一个去原站（锁 30 秒），其余稍等再取；读原站每个访客 10 分钟最多 30 次（命中缓存的不算）；单章正文最大 150 KB；缓存键带正文提取的版本 `v`，改了提取方法就自动重读。
- **PostgreSQL 表**：`library.book_chapters(book_id, ch, parser, title, html, lang, license, source_url, bytes, reads, fetched_at, last_read_at, PRIMARY KEY (book_id, ch, parser))`，迁移文件 `migrations/006_library_book_chapters.sql`；连接沿用 `OPS_DATABASE_URL` / `POSTGRES_URL`；这个服务只读写这一张表。**迁移要用户自己在数据库里执行**，我不要也不看数据库口令。
- **和别的数据的分工**：共享内容（章节正文）→ 这里；个人数据（读到哪、书签）→ 现有同步码；编辑数据（系列、合集、封面、排序）→ 以后放运营后台 `ops` 库。缓存键是“书编号 + 章序号”，以后书单搬进运营后台也不用重存。
- **页面**：`bookLoad()` 依次试：本机（Cache API `zt-book-chapters`，最近 60 章）→ `/api/book`（地址由 `submit_api` 推出，和 `/api/feed` 一样）→ `/api/feed read`；章节页脚显示来源、授权和“阅读原文”。
- **预热（可选）**：`python books_tool.py warm [--only 书编号]` 对 `/api/book` 礼貌地逐章请求，让第一批读者也秒开。

#### 书单：章节标题（R1，shelf-directory ↔ 页面）

`registry/books.json` 的 `ch` 多一个**可选**字段 `t`，写进 `directory.json` 的条目：

```json
"ch": {"s": "zh.wikisource.org", "p": "紅樓夢/", "n": ["第001回", "第002回"], "t": ["甄士隱夢幻識通靈 賈雨村風塵懷閨秀", "賈夫人仙逝揚州城 冷子興演說榮國府"]}
```

- `t` 和 `n` 一样长，每项最多 60 字，可以有空字符串；长度对不上的整个丢掉并在构建日志里说明。
- **页面必须容忍没有 `t`**（没有就只显示章名）；有 `t` 时章节面板显示“第 1 回　甄士隱夢幻識通靈…”。
- 标题来源：维基文库每章页面的第一行标题；`books_tool.py titles` 分批读取（一次 50 页），读不到的章留空，整本都读不到就不写 `t`。英文书章名本身就是篇名（福尔摩斯）或只有 Chapter N（不补）。

#### 本机保存（R1–R4，页面内）

- **阅读位置**：`archive.progress['bk:<书的目录编号>'] = {i: 章序号, pct: 章内百分比, at: 时间}`。沿用现有 `progress`，所以现有的同步码会把它带到别的设备；旧的 `archive.bookPos`（只有章序号）读到时迁移。
- **章节正文缓存**：R0 做，浏览器 Cache API，名字 `zt-book-chapters`，键是章节地址，最近读的 60 章，超出时丢最旧的；下次打开同一章不再请求，也方便离线。
- **阅读设置**（`archive.reader`）新增，默认值都等于现在的样子：`ff` 字体（`follow` / `serif` / `sans` / `kai`）、`pg` 段距（`s` / `m` / `l`）、`ind` 首行缩进（布尔）、`jus` 两端对齐（布尔）、`mode` 滚动或翻页（`scroll` / `paged`，R2）。
- **翻译缓存**（R4）：浏览器里按“目标语言 + 段落文字的哈希”一段一条；服务端的缓存（Upstash 90 天）不变。

#### 页面里的约定

- 阅读项里带 `bookOf`（书的目录编号）的是书章节；`bookItem` 创建，章节地址仍是 `https://<s>/wiki/<p><n>`（空格写 `_`）。
- 章末“下一章”按钮是章节文档里的 `<a data-bk="prev|next">`，由页面代为处理点击（文档里不放脚本）。
- 预读：章载入后读到 60% 或停留 20 秒，**只预读下一章一次**；服务端出错或受限（429）就停，不重试；不预读上一章。

### 各步怎么算做完

**R0 共享内容缓存**
- shelf-directory：`bookapi.py` + `api/book.py`（读取顺序、授权闸门、两层存储和升层、锁、限流、响应头）；存储做成可替换的一层（内存版用于测试、Redis 版沿用 `syncapi` 的封装、PostgreSQL 版用 `psycopg`）；`migrations/006_library_book_chapters.sql` 和 migrations/README；`books_tool.py warm`；`registry/books.json` 现有条目补 `keep: true`；`check_book` 认 `keep` / `share`；`SHELF-SPEC.md`、README、`.env.example`。
- 测试：`tests/test_bookapi.py`——未知书 / 章、越界章号、授权闸门（nocache）、第一次读走原站并写入两层、第二次不再读原站、Redis 过期后从 PostgreSQL 补回、冷门章读满 5 次升层、没配 PostgreSQL / Redis 时的退化、同时读的锁、读原站限流、超大正文、缓存键带版本、CORS 和响应头、出错不被 CDN 缓存、地址不接受访客输入；整个 `tests.test_*` 不退步。PostgreSQL 版只能用假游标测逻辑（本机没有驱动和库口令）；另附 `python bookapi.py check-db`，由用户在自己的环境里跑，确认真实库能写能读。
- 页面：`bookLoad()` 三层读取、章节页脚的来源和授权、`/api/book` 不可用或 `nocache` 时退回；`devtools/e2e/tests/s_bookcache.js`：第一次读请求了原站；清掉浏览器数据再打开同一章，原站日志**没有**新请求（云端命中）；不清数据再打开，连 `/api/book` 都没有请求（本机命中）；不可共享的书走 `/api/feed read` 且不上云；云端出错退回；章节页脚显示来源和授权；R1 之前的页面测试不退步。
- 预览：8820 端口 + 本机假服务，演示“同一章第二个访客秒开”。上线要用户自己：执行迁移、设好 `OPS_DATABASE_URL` / Redis 变量、推送并 `vercel --prod`。

**R1 读书模式**
- 书的章节：顶栏显示“书名 · 章名 · n/N”；`章节` 面板（手机右侧抽屉，≥1200px 宽屏可固定在左侧）列出全部章节，当前章高亮、读过的有标记，点一章跳转；有 `ch.t` 时显示标题。
- 章末一个明显的“上一章 / 下一章：标题 ›”；←/→ 键和手机底栏照旧；书章里**不再**用侧滑换章（避免误触），普通文章仍然可以。
- 记住章内位置：关掉再开，回到上次的位置；书的窗口和卡片显示“继续阅读 第 12 回 · 45%”；整本进度 = (章序号 + 章内比例) / 总章数。
- 预读（读到 60% 或停 20 秒后读下一章一次，走 R0 的 `bookLoad`）；断网时读过的章还能打开。
- 读书排版选项（字体、段距、首行缩进、两端对齐）在 `Aa` 里；默认不变，对所有文本阅读都生效但不改变现有外观。
- 手机点正文中间显示 / 隐藏工具栏（只在书章里）。
- 测试：`s_bookreader.js`（章节面板、跳转、章末按钮、预读只发一次、缓存命中、位置恢复、迁移 `bookPos`、没有 `ch.t` 时正常、手机宽度、英文）；`s_books.js`、`s_readerui`、`s_reader_usability`、`s_mobile`、`s_shell`、`s_dir`、`s_first`、`s_translate` 不退步；shelf-directory 全部测试 + `tests/test_books.py` 新增 `ch.t` 的校验。
- 预览：8820 端口，真实书单（`devtools/e2e/books_preview.py`），打开红楼梦看标题、章节面板、章末、记住位置。

**R2 翻页模式**
- `Aa` 里“阅读方式：滚动 / 翻页”，默认滚动，设置记在本机。
- 翻页：点屏幕左 / 右 30% 翻页，中间 40% 显示 / 隐藏工具栏；左右滑动、← → / 空格 / PgUp / PgDn；页码“12 / 37”；到最后一页再翻进入下一章第一页，翻回去落在上一章最后一页；宽屏（≥1100px）可选双页。
- 位置：按“第几段 + 段内比例”记，改字号、改窗口大小后回到同一处；和滚动模式的位置互通（都存百分比，进入时换算）。
- 不适合分页的章（含表格、大图、很长的预排版文字）自动用滚动，并在 `Aa` 里说明。
- 文档里的链接、选中文字、书签仍然可用；翻页模式下目录跳转落在对应页。
- 测试：`s_bookpaged.js`（点区翻页、滑动、键盘、页码、跨章、改字号后位置不变、双页、退回滚动、手机）；R1 的测试不退步。

**R3 精选图书卡片**
- 只对精选图书（`type=book` 且有 `license`）生效，别的卡片不变。
- 卡片：书封 + 书名 + 作者 + 2–3 行摘要 +“试读 / 继续阅读”按钮（试读 = 第一章，继续阅读 = 记住的章和位置）；没封面图时生成文字书封（书名大字 + 作者，每本一个颜色）。
- 列表模式：小书封 + 书名 + 作者 + 一行摘要 + 章数 + 授权。
- 不做强制全屏、自动切换的浏览方式。
- 测试：`s_books.js` 扩（卡片按钮、继续阅读、列表模式、手机、英文）；`s_dir`、`s_first`、`s_sections` 不退步。

**R4 按需翻译**
- 翻译只处理：书章的标题、当前章正文、**目录**（章节面板里的章节标题，以及文章里的小标题目录，点“翻译目录”或随正文一起翻，翻过的显示在原标题旁边）；书的窗口里“翻译简介”只处理书名和简介；不处理作者、标签、导航、代码块；卡片永不自动翻译。
- 阅读页“翻译”按钮点开后选“翻译本屏 / 翻译本章”（本屏 = 现在看得见的段落及前后各约一屏）；译文仍逐段显示在原文下面，可切换双语 / 仅译文 / 原文。
- 按段缓存：同一段再次出现（重读、翻页后回来、别的章里重复的句子）不再请求翻译服务。
- 手机：书章阅读页右下角一个小浮动按钮，点开选“翻译本屏 / 翻译本章 / 看原文”；只在翻译服务可用、内容可以站内读时出现；不遮挡正文和底栏，专注模式里隐藏，翻页模式的点区避开它。
- 额度提示：剩余字数不够时说清楚，不静默失败；仍然遵守“第一次点要先确认”。
- 测试：`s_translate.js` 扩（本屏 / 本章、只翻指定内容、段缓存命中不再请求、手机浮动按钮、配额用完）；R1–R3 的测试不退步。

### 端口

- claude：8800–8899、9440–9449（演示站 8820，假服务 8840–8850，浏览器 9444 / 9445）。

### 风险和要避开的冲突点

- **阅读器是全站共用的**：所有新行为用 `bookOf` 门控；每步都跑普通文章的阅读测试。
- **翻页最容易出问题**：分栏排版在不同浏览器的表现、改字号后的定位、选中文字和链接、iOS 的手势。所以放第二步、默认关、能退回滚动，每一步都要手机宽度的测试，并请你在真机上看。
- **版权**：云端只存授权允许转载的书；`license` 必须写；不确定的一律不存云端。这是对“目录不存全文”原则的一个有限例外，只对精选图书里授权明确的书。
- **PostgreSQL 无法在本机真实验证**：没有驱动和库口令；用假游标测逻辑，真库由用户迁移后用 `check-db` 验证；在那之前代码对“没配数据库”做退化，不会影响读书。
- **服务端有限流**：读页面每个访客 10 分钟约 40 次，预读只一次、出错就停；翻译每人每天约 3 万字，所以翻译改成“按屏”，并按段缓存。
- **章节标题的批量读取**要礼貌：一次 50 页、有间隔、带自己的 User-Agent，读不到就留空，不凑数。
- **同步**：`bk:` 键沿用现有 `progress` 的同步，不新增同步结构；合并两台设备时取较新的 `at`。
- **冲突热点**：`index.html` 的词典大行不碰；新字符串走 `Object.assign`；Codex 目前没有在改阅读器或精选图书（热榜改版已合并）；开工前再查 `git status` / `git log -3`。

## 3. 进度

### claude

- **R0 共享内容缓存（已合并，2026-11-02）**：shelf-directory 分支 `claude/book-content`（`bookapi.py` + `api/book.py`、`migrations/006_library_book_chapters.sql`、`books_tool.py warm`、书单条目加 `keep: true`、目录行加 `bid`、README B6c / SHELF-SPEC / `.env.example`；`tests/test_bookapi.py` 30 个，全部 685 个测试通过）；my-archive 分支 `claude/book-content-ui`（`bookFetch`：本机 Cache API → `/api/book` → `/api/feed`；章节页脚写授权和来源；`devtools/e2e/tests/s_bookcache.js` 12 项）。设计上和规划不同的一处：**升层看的是“到过函数的读取次数”**（CDN 会挡掉一小时内的重复读取，所以 `BOOK_PROMOTE_READS` 默认 3 = 至少在三个不同的小时被读到），不是总阅读数。PostgreSQL 这层只能用假游标测逻辑，真实数据库要用户执行迁移后用 `python bookapi.py check-db` 验证。
- R1–R4：未开工。

### codex

未分配。

## 4. 合并记录

- **R0（2026-11-02，`--no-ff`，没推送、没部署）**：
  - 合并顺序：shelf-directory `claude/book-content`（e66d00a）→ my-archive `claude/book-content-ui`（84e4b41）；两个分支合并前都已包含最新的 master，没有冲突。合并后在 shelf-directory 里又用现有快照离线构建了一次 `docs/`（ca3f37d：目录行带上 `bid`，只改了 `docs/directory.json`），线上要等用户推送并重新部署。
  - 合并后的测试结果：shelf-directory 全部 685 个测试通过；页面在 master 上：`s_bookcache` 12、`s_books` 19、`s_translate` 22、`s_dir` 128、`s_first` 29、`s_sections` 20、`s_readerui` 23、`s_shell` 76、`s_mobile` 39（清掉计数库后）、`s_lang` 13、`s_rich` 48、`s_hotpage` 54、`s_text` 27、`s_notes` 61，全部通过；重名函数和语法检查通过。
  - 删除的分支和 worktree：`claude/book-content`、`claude/book-content-ui` 和 `E:\\Ztree\\wt\\claude-book-content*` 都已删。
  - 上线要用户做：在数据库里执行 `migrations/006_library_book_chapters.sql`，自己的终端里设好 `OPS_DATABASE_URL` 后运行 `python bookapi.py check-db`；推送 shelf-directory 并部署（`api/book.py` 才会出现）；my-archive `vercel --prod`；可选 `python books_tool.py warm` 预热。
- **R1 读书模式（已合并，2026-11-02）**：my-archive 分支 `claude/reader-book-mode`、shelf-directory 分支 `claude/books-titles`。
  - 页面：书章的章节面板（目录面板第一个标签，整本书的章名和标题、当前章高亮、读完的打 ✓、第几章和全书约百分之几）；章末“上一章 / 下一章：标题”大按钮；“上一章 / 下一章”文字在书里改成章；读到 60% 或停 20 秒预读下一章一次；位置记在 `progress['bk:<书>']`（章、章内百分比、读完的章）并随同步码走，旧的 `bookPos` 照读；书的窗口显示“继续读：第 12 回 · 45%”、已读约百分之几、读完的章打 ✓，卡片写“读到 第 12 回”；“Aa”新增字体 / 段距 / 首行缩进 / 两端对齐（默认值和以前完全一样，只写不是默认值的变量）；手机上点正文中间显示 / 隐藏工具栏，书里关掉左右滑动换章。`devtools/e2e/tests/s_bookreader.js` 24 项。
  - 书单：`ch.t`（可选，每章一个标题，`aggregate.check_book` 校验、不合格只丢 `t`），`books_tool.py titles` 读标题；已写入 9 本中文书共 786 个标题（红楼梦 120、西游记 101、三国 124、水浒 103、儒林外史 56、镜花缘 100、庄子 33、史记 130、山海经 19）；`tests/test_books.py` 新增解析器和命令的测试。
  - 和规划不同的两处：①“≥1200px 宽屏固定在左侧”的章节栏**没做**，章节面板在所有宽度都是右侧抽屉，固定栏放到 R2（和双页版面一起做版面）；②卡片上只写“读到 第 N 回”，“试读 / 继续阅读”按钮留给 R3。
- **R4 按需翻译（做完，待预览）**：my-archive 分支 `claude/reader-translate`。书章的“翻译”按钮开一个小菜单（`#trMenu`）：翻译本屏 / 翻译本章 / 翻译目录，翻过以后加“切换（双语 / 译文 / 原文）”和“今天还可以翻译约 N 字”；手机上书章右下角一个圆形小按钮（`#trFab`，不在专注阅读里、文章里没有）；**按段落缓存**（Cache API `zt-translate-p`，文字和语言是键，约 6000 段，替换了原来的整页缓存）；目录的标题（书的 `ch.t`，或文章的小标题）翻译后显示在目录里标题下面（`trLines` / `trTocLine`），翻译本章时目录跟着翻；书的窗口里“翻译简介”（`bookIntroButton`）。作者 / 来源 / 授权行（`.doc-meta`、`.doc-src`、`.doc-lic`）、标签、导航、代码块不翻译，卡片不自动翻译。别的文章的翻译仍然是点一下整页（缓存改成按段）。`devtools/e2e/tests/s_booktrans.js`。
- R2、R3：未开始（R3 在另一个分支）。

## 4b. R1 合并记录

- **R1（2026-11-02，`--no-ff`，没推送、没部署）**：
  - 合并顺序：shelf-directory `claude/book-content-cli`（数据库诊断和 `load`，用户确认 `check-db` 已经没问题；48af5b8）→ `claude/books-titles`（1855cd4）；my-archive `claude/reader-book-mode`（d852cdc）。三个分支合并前都已并入最新的 master（只多了 Codex 的热榜分类规划文档），没有冲突。合并后在 shelf-directory 里又离线构建了一次 `docs/`（295e614：`directory.json` 带上 9 本书的 `ch.t`），线上要等用户推送并重新部署。
  - 合并后的测试结果：shelf-directory 全部 710 个测试通过；页面在 master 上：`s_bookreader` 24、`s_bookcache` 12、`s_books` 19、`s_translate` 22、`s_dir` 128、`s_first` 29、`s_sections` 20、`s_readerui` 23、`s_shell` 76、`s_mobile` 39（清掉计数库后）、`s_reader_usability` 12、`s_lang` 13、`s_rich` 48、`s_hotpage` 54、`s_text` 27、`s_notes` 61，全部通过；重名函数和语法检查通过。
  - 删除的分支和 worktree：`claude/book-content-cli`、`claude/books-titles`、`claude/reader-book-mode` 和它们的 worktree 都已删（`E:\\Ztree\\wt\\claude-book-content-cli` 剩一个空文件夹被用户的终端占着，关掉那个终端后手动删）。
  - 没做完、留给后面的：R2 翻页模式（含宽屏固定章节栏、双页）、R3 精选图书卡片 / 列表（含“试读 / 继续阅读”按钮、文字书封）、R4 按需翻译（本屏 / 本章、按段缓存、手机浮动按钮、翻译目录）。
