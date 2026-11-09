# 内容不更新：原因、修复，左侧栏顺序，热门和更新的比例（2026-11-09）

状态：修复已做（`claude/fix-daily`，待合并）/ 侧栏开发中 / 算法等用户定

## 1. 任务清单（用户）

- [ ] 检查精选文章、今日听什么、精选图书、看什么里，有的是订阅但没有每天更新，有的还是之前的（例：B 站热门视频还是上个星期的）。
- [ ] 1. 没更新时，用什么算法保证热门内容和更新内容的比例？还是让读者选时间跨度？
- [ ] 2. 左侧栏顺序：“全部”放最后，精选文章和看什么放前面（访问频率不一样）。

## 2. 规划（Claude）

### 查到的事实（2026-11-09）

- **每日更新从 2026-11-02 起没有跑。** `shelf-directory/.github/workflows/daily.yml`（每天 03:17 UTC 读所有来源、重建 `docs/`）里，`50b0dc6`（2026-11-02，Translation of an article's text，是我做的）加的两行 `ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET` 缩进成了 6 个空格（应是 10 个），整个文件不是合法 YAML（PyYAML：`line 38 expected <block end>`）。GitHub 不会运行解析不了的工作流，所以定时任务一次也没触发。证据：最后一次 `daily: refresh the directory` 提交是 2026-11-01；线上 `directory.json` 里每天新进的条目 11-01 之前是 55–185 条，11-02 到 11-06 是 4、5、5、2、1 条（那几条是批准的投稿，不是抓取）；线上 `generated` 是今天，因为 `set` / `remove` / `list` 这几个工作流会重建 `docs/`，但它们不抓取新内容。
- **“看什么”里的 B 站热门视频、YouTube 热门是 11-01 那天的榜**：它们是注册来源 `hot-bilibili`、`hot-youtube`（`adminbook.zhitree.cn/api/hot?n=10&p=…`），每次每日抓取把快照换成当天榜单的 10 条，条目日期就是榜单那一天。不抓取，榜就停在那天。
- 线上现状（1252 条）：文章 468（日期的中位数是 9 天前）、播客节目 709（中位数 153 天前，每个节目最多留 50 期，所以老的期数一直在）、视频 21（最新 11-03）、图书 54（没有日期：人工挑选的，本来就不按时间更新）。53 个来源里 43 个来源最新一条在 7 天前，其中 5 个在 14 天前。
- 页面怎么排：目录页默认“最新”，同一天里各来源轮流排（`interleaveDays`）；另有“在本站阅读最多”“热度”“标题”三种；没有时间跨度的选择，也没有把“热”和“新”混在一起的排法。
- 左侧栏现在的顺序（`index.html` 里 `$('#cats').innerHTML = …`）：发现世界、热榜、今日听什么、精选图书、**全部**、精选文章、看什么。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| 修每日工作流 + 一个防止再出的测试 | claude | `claude/fix-daily` · `E:\Ztree\wt\claude-fix-daily-sd`（shelf-directory） | `.github/workflows/daily.yml`、`tests/test_workflows.py` | 其它 |
| 左侧栏顺序 | claude | `claude/sidebar-order` · `E:\Ztree\wt\claude-sidebar-order`（my-archive） | `index.html`（`#cats` 的生成那一行）、用到顺序的 e2e 测试、README / 指南里写到顺序的地方 | 搜索音乐分支 `claude/search-music` 里的改动 |
| 热门和更新的比例 | 等用户定 | — | — | — |

### 接口约定

- 左侧栏新顺序：发现世界、热榜、今日听什么、精选图书、精选文章、看什么、（其它类型：笔记、PDF、工具……）、**全部**。依据：线上访问量（热榜 115、今日听什么 108、精选图书 93、发现 78、精选文章 69、看什么 43）基本就是这个顺序；“全部”挪到最后。

### 验收

- `python -X utf8 -m unittest tests.test_workflows`（shelf-directory）通过；`daily.yml` 能被 PyYAML 解析。合并并推送后，在 GitHub 的 Actions → Daily → Run workflow 手动跑一次（用户做），之后新条目应该每天出现。
- 侧栏：e2e 里用到侧栏顺序的几套全过（`s_first`、`s_shell`、`s_public_bar`、`s_hotpage`、`s_listen`、`s_more`、`s_dir`、`s_bookpage`），预览里看顺序。

### 风险和要避开的冲突点

- 工作流只有推送到 GitHub 才生效，我不推送；合并后由用户推送。
- `index.html` 的同一行可能和 `claude/search-music` 里的改动靠得近，先合并的那个不受影响，后合并的看冲突。

## 3. 进度

### claude

- 2026-11-09 工作流已修（`claude/fix-daily` 的 `6c9f45f`），测试 2 条通过。

## 4. 合并记录

- 合并顺序：
- 合并后的测试结果：
- 删除的分支和 worktree：
