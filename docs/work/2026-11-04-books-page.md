# 精选图书页：简化、卡片瘦身、退出不弹窗、书单（2026-11-04）

状态：已确认（2026-11-04，用户：规划按建议做；“已更新时间”全站去掉；简介留着；书单数据由 claude 一起做）

用户的决定：
- “已更新时间”（`#updNote`）**全站去掉**，不只是精选图书页。下拉刷新、回到页面隔 10 分钟再看一次、出错时的“重试”都还在；只是不再有那一行字和 ↻ 按钮。
- 卡片上的简介（两行）**留着**。
- 书单数据（`booklists`）由 claude 在 `shelf-directory` 里一起做（分支 `claude/books-lists`），不交给 Codex。

## 1. 任务清单（用户）

1. 去掉“已更新时间”“节目”“栏目”“平台”。精选图书界面简约美观，不需要参与筛选。
2. 图书卡片去掉“站长推荐”、“书籍”标签、“公有领域”；只显示语言、作者 / 来源、喜欢、收藏、读书用户的个人进度、热度等。
3. 退出直接就退出，不要再显示弹窗。
4. 书籍的筛选和分类，以及是否要设置书单和合集。
5. 去掉“发现世界”左侧的标签。

## 2. 规划（Claude）

### 现在的样子（在预览里看过）

- 精选图书页（侧栏“精选图书”，`state.dLanding==='books'`）现在和“全部”共用一套筛选条：`#dirBar` 里有“节目”按钮、“栏目 | 平台”开关、一排栏目芯片，标题下有 `#updNote`（“已更新 16:23 ↻”）。
- 卡片（`dirCardHTML` → `dirXCoverHTML`、`dirMetaLine`）：封面左上“站长推荐”（`whyHTML`）、右上“书籍”（`.ftype`），底下一行“书籍 · 精 · 精选图书 · 公有领域”，再有 `#小说 #现代` 标签、简介、♥、收藏、“试读”。
- 第 3 点：关掉书的阅读页时，`closeReader` 最后一行 `if(bookBack) openBook(bookBack,true)` 会把“章节表”窗口（`#bookDlg`）又弹出来，说明文字里也写着“关掉阅读页会回到这张章节表”。这就是“退出还要弹窗”。
- 第 5 点：左侧“标签”是 `renderDir` 里的 `renderTagbox(d.tags.slice(0,60), …)`（`#tagbox`），我的书架那边也用同一个盒子，**只去发现世界这一边**。

### 第一步：可以直接做（第 1、2、3、5 点）

| 项 | 做法 |
|---|---|
| 1 | `#updNote` 全站去掉（`updNoteSync` 只留“下拉刷新时关掉浏览器自己的下拉”这件事，元素、样式、“已更新 / 更新中”两句话和 ↻ 按钮都删）。在精选图书页：`#dirBar` 不显示；进入这一页时不再套用“节目 / 栏目 / 平台 / 领域”的筛选状态（`dPick`、`dPickT`、`dTab`、`dSub`），也不在副标题里列出这些筛选的小标签。其它发现世界的页面不动。顶栏的搜索框和 中 / EN 还在（它们是整个站的，不是这一页的筛选条）。 |
| 2 | 精选图书的卡片（卡片视图和列表视图都改）：去掉左上“站长推荐”、右上“书籍”、“公有领域”、`#标签`、“精选图书”书架名。底下一行只留：语言（中文 / English）· 作者 · 来源（原站的名字，例如“维基文库”“古腾堡计划”，不是“精选图书”）· 章数；右下 ♥（有数就带数）、热度、收藏、“试读 / 继续阅读”。**读书用户的个人进度**：有进度时写“读到 第 3 章 · 32%”，封面底边一条细进度线；没读过就什么也不写。简介（两行）留着，因为选书靠它。授权信息不丢：阅读页底部和书的章节表里仍然写（`bookLicLine`），只是不在卡片上。 |
| 3 | 删掉 `closeReader` 里回弹章节表的那一行；说明文字（zh / en）去掉那半句。章节表还在阅读页的“目录 → 章节”里。点卡片上的“试读 / 继续阅读”本来就直接进阅读页，不动。 |
| 5 | 发现世界不再画侧栏标签盒（不调用 `renderTagbox`，盒子隐藏）。卡片上的标签和 `state.dTag` 的逻辑不动，别处点标签仍然能筛。我的书架的标签盒不动。 |

### 第二步：分类和书单（第 4 点，要用户先定）

精选图书现在没有“分类”这个字段，只有零散的标签（演示数据里 54 本：在线书籍 38、英文 28、小说 25、古典 18、技术 7、科学 7、编程 6、哲学 5……）。我的建议：

1. **类别（筛选）**：页面上只有**一排**小标签，不带数字：`全部 · 小说 · 古典 · 哲学 · 科学 · 技术 · 历史 · 杂志`（最多 8 个，多的收进“更多”），选一个就只看这一类，再点一次回到全部。语言用顶栏现有的 中 / EN，不再另做一个。类别由前端按标签映射（`BOOK_GENRES`，“在线书籍”“英文”这类不算类别的标签直接忽略）；以后服务端给了 `genre` 就以它为准。
2. **书单**：站长挑的、有顺序、有一句推荐理由的主题单，例如“鲁迅入门五篇”“四大名著”“英文短篇入门”“编程经典”。显示在页面顶上，一排 3–6 张叠封面的卡片，点一张就只看这张书单里的书（有返回箭头），书单里每本书写一句话。这是**帮人选书**的东西，价值比类别高。
3. **合集：先不做成单独的东西。** 原因：“合集”在这个站里已经是另一个意思（我的书架里订阅栏目的分组，`colLabel`、`colDlg`），再用会混。“同一作者的书”由“作者”自动生成就够了（点卡片上的作者名，看他的全部）；“系列”（例如福尔摩斯探案集）如果以后真有，就当成一张书单。
4. **我自己的书单**：不做。收藏就是“我的”；音乐里的歌单是因为要排播放顺序，书没有这个需要。
5. **数据放哪**：书单由站长手写，放 `shelf-directory`（一个小 JSON，`aggregate.py` 并进 `directory.json` 的 `booklists`）。没有 `booklists` 时页面不显示这一排，不出错。这一块是 shelf-directory 的改动，可以交给 Codex，也可以我顺手做——要用户定。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| 第一步（1、2、3、5）+ 第二步前端（类别、书单一排、作者） | claude | `claude/books-page` · `E:\Ztree\wt\claude-books-page` | `index.html`、`devtools/e2e/tests/s_book*.js`（新增 `s_bookpage.js`）、`devtools/e2e/run_all.ps1`、`devtools/e2e/make_demo.py`（只加钩子）、`devtools/e2e/books_preview.py`（演示书单）、`library/notes/guide/*`、`README.md` | 播放器和听歌的函数（`pl*`、`lp*`、`ls*`）、热榜的函数（`renderHotPage` 等，Codex 在改）、翻译词典的长行（新词只加在新行里） |
| 第二步数据（`booklists`，可选 `genre`） | claude | `claude/books-lists` · `E:\Ztree\wt\claude-books-lists`（在 `shelf-directory` 里） | `shelf-directory` 的 `aggregate.py`、测试、一个书单 JSON | `listen.py`、`hotapi.py`（Codex 在 `codex/music-sources` 里改） |

### 接口约定

- `directory.json` 的 `items[]`（精选图书）可以多一个**可选**字段 `genre`（字符串，取值 `novel / classic / philosophy / science / tech / history / magazine / other`）。没有就由前端按标签推。
- `directory.json` 顶层可以多一个**可选**字段 `booklists`：`[{id, name, blurb, books:[{id, why}]}]`，`books[].id` 是 `items[].id`。没有就不显示书单。
- 页面这边的路由和状态：书单用 `state.dList`（空 = 不在书单里），类别用 `state.dGenre`（空 = 全部）；都不写进 `localStorage`，刷新回到“全部”。

### 验收

- 预览：`http://127.0.0.1:8830/` → 左上“发现世界” → 侧栏“精选图书”。看：标题下没有“已更新”；没有“节目 / 栏目 / 平台”和那一排芯片；侧栏没有“标签”；卡片上没有“站长推荐 / 书籍 / 公有领域 / #标签”；点“试读”进阅读页，读几章再点左上返回，直接回到精选图书页，没有章节表弹出；回来后卡片上有“读到 第 N 章 · X%”。
- 测试：`wt_run.ps1 -Quick`（快速集）全绿；加跑 `s_books`、`s_bookcards`、`s_bookreader`、`s_bookcache`、`s_booktrans`、`s_bookpaged`、`s_shell`、`s_swkeep`；新增 `s_bookpage`（上面各条各一项检查，英文界面再各查一遍；阅读页关闭后 `#bookDlg` 没有 open）。页面检查：重名函数、语法（`page_checks.py`）。
- 现有测试里依赖旧卡片文字或 `#updNote` 的要同步改，改动写进进度。

### 端口

- claude：8800–8899、9440–9449；codex：8900–8999、9450–9459。

### 风险和要避开的冲突点

- Codex 在 `codex/hot-analytics-ui`、`codex/hot-social-polymarket-ui` 里改热榜页，可能碰 `dirStatsHTML`（热度数字）；我只改 `dirMetaLine`、`dirCardHTML`、`dirRowHTML` 里 `isPickedBook` 的分支，不改 `dirStatsHTML` 的内容。合并时谁后合并谁处理冲突。
- `claude/music-core`（听歌 F1）还没合并，也改了 `index.html`，但在播放器和听歌页的函数里，和这里不交叠；从 `master` 开分支即可。
- 整个站的翻译词典是几行超长的行：新词（`bkReadAt` 的新写法、`BOOK_GENRES` 的名字、书单的字）一律用新的 `Object.assign(I18N.zh/en,{…})` 行。
- 说明文字里“关掉阅读页会回到这张章节表”这句在 `bookNote`（词典长行里）：改它要动那一行，只改这一句，合并时留意。

## 3. 进度

### claude

分支 `claude/books-page`（`E:\Ztree\wt\claude-books-page`，`index.html` 和测试）和 `claude/books-lists`（`E:\Ztree\wt\claude-books-lists`，`shelf-directory` 的书单数据）。预览：`http://127.0.0.1:8831/`（发现世界 → 精选图书），用 `preview_books.ps1` 起。

- 第 1 点：`#updNote` 全站去掉（元素、样式、`updAt` / `updGo` 两句话、↻ 的点击处理都删了；`updNoteSync` 只剩切换 `html.ptr`）；精选图书页不显示 `#dirBar`，不再调用 `renderDirBar`，`dirList` 在这一页不套用节目 / 栏目 / 平台 / 领域 / 视图的筛选（`booksPage()` = `dLanding==='books'` 且没有选书架和标签）。
- 第 2 点：`dirMetaLine` / `dirXCoverHTML` / `dirCardHTML` / `dirRowHTML` 里精选图书走新分支：不再有“站长推荐”（`dirWhy` 对精选图书不返回 pick）、“书籍”、书架名、书架标记、授权、标签；一行只有语言 · 作者 · 来源（`BOOK_SRC` 里认得的站写名字，其余写网址）· 章数 · “读到 第 3 回 · 12%”；封面底边 `.bk-prog` 细线；作者名是按钮（`data-bauthor`）。简介留着。
- 第 3 点：`closeReader` 不再 `openBook`，说明文字（zh / en）去掉“关掉阅读页会回到这张章节表”。
- 第 5 点：`renderDir` 不再画侧栏标签盒（`#tagbox` 隐藏）。
- 第 4 点：`booksPage` 上的书单一排（最多 4 张，“全部 N 张书单 ▾”展开）、类别一排（`BOOK_GENRES`，按 `genre` 或标签推，只列有书的、只有一类时不显示）、作者筛选；`state.dList` / `dGenre` / `dAuthor` 不写 `localStorage`；`dirBuild` 校验并带上 `booklists`；书单里的书按书单的顺序排，每本有 `why` 一行。点击由一个捕获阶段的 `document` 监听处理（`data-blist` / `data-bgenre` / `data-bauthor` / `data-blmore`）。
- 书单数据（`shelf-directory`）：`registry/booklists.json`（8 张书单，每本书中英文各一句）、`aggregate.load_booklists`（校验、把书编号换成目录里的 `id`、跳过目录没有的书并在构建日志里说明、不足两本的整张跳过）、`directory.json` 的 `booklists`、`tests/test_booklists.py`（真实书单的每本书都在 `books.json` 里）、README B6b 一条；`genre` 后端没有做，前端按标签推，以后服务端给了就以它为准。
- 测试：新增 `s_bookpage.js`（进快速集）；改了 `s_books`（关阅读页不再弹窗、卡片不写授权）、`s_bookcards`（卡片没有徽标，读到哪里带百分比和细线）、`s_first`（侧栏没有标签盒）、`s_swkeep`（没有 `#updNote`，用 `state.dirAt` 和 `dirRefresh` 查回到页面和下拉刷新）。
- 文档：README（发现世界一段、精选图书一段、新的“精选图书页”一段、回到应用时自动更新）、使用指南 zh / en（新的“精选图书”一条）、页面里的更新说明（zh / en 各一条）。
- 没有做：顶栏的排序下拉（“最新发布”）在这一页还在，书按“页面语言在前、热度、书名”排；要藏起来是一行 CSS，等用户说。

### codex

## 4. 合并记录

- 合并顺序（用户说“合并”，2026-11-04）：`shelf-directory` 的 `claude/books-lists` 先合进它的 `master`（`631f59c`，那边 126 项相关测试通过、全套 734 项里只有已知的 1 个旧失败）；`my-archive` 的 `claude/music-core` 先合（`dfa3086`），再把 `master` 并进 `claude/books-page`（三处冲突：新增文字行、更新说明 zh / en、`run_all.ps1` 的测试清单，两边都留），再合 `claude/books-page`（`2c4910e`）。
- 合并后的测试结果：在并好的 `claude/books-page` 上跑全套 35 项：除已知的 4 条旧失败外全绿（`s_lang` 因为电脑中途休眠了十几个小时超时，单独重跑 13 项全过）；快速集之前已在合并前跑过，11 项全绿。
- 删除的分支和 worktree：`claude/books-page`、`E:\Ztree\wt\claude-books-page`；`shelf-directory` 的 `claude/books-lists` 和它的 worktree 已在合并后删掉；预览服务（8831、8864–8867、8871）已停。用户试用后追加的第 7、8 条在 `claude/books-fixes`（见上面“追加”），还没合。
