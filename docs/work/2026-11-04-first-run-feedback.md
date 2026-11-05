# 新用户第一屏、共读群、反馈、周更内容、收录（2026-11-04）

状态：规划中（用户已定：共读群放“阅读指南”的封面和文章顶部、反馈存到 shelf-directory；其余照 Claude 的建议。**G4 要先出方案、用户看过再做**；开工前等用户说“确认”）

## 1. 任务清单（用户）

来自用户贴来的一份增长建议（被发现 → 到站 → 首次得到价值 → 愿意回来 → 愿意推荐）和用户的回答：

- [ ] 共读群（微信群或 QQ 群）：放在“我的书架”里“阅读指南”那张卡的封面上；“加群获得更好的体验、反馈”的提示文案放在文章顶部。
- [ ] 反馈：存到 `shelf-directory` 的服务里（匿名，站长在后台看）。
- [ ] 不做自动弹窗，不做浮在内容上的悬浮按钮（Claude 的建议，用户同意）。
- [ ] 其余按 Claude 的建议：先让新用户快速得到价值（第一屏），再扩大流量（周更内容、核心功能页、收录）。

## 2. 规划（Claude）

### 任务（编号 = 进度里用的编号）

| 编号 | 任务 | 说明 |
|---|---|---|
| G1 | 反馈服务端（shelf-directory） | `feedbackapi.py` + `api/feedback.py`：匿名收反馈，存 Redis（和同步、统计用同一个），后台能看、能删；测试；README 和隐私说明 |
| G2 | 反馈前端（my-archive） | 一个反馈小窗（类型、内容、可选联系方式）；入口三个：侧栏底部“反馈 / 共读群”、首次收藏或读完一本书后的一次性 toast（带按钮）、阅读指南顶部的链接（`/#feedback`）；不弹窗、不悬浮；测试 |
| G3 | 共读群 | 阅读指南的封面图（`archive:cover`，带群二维码和一句话）、阅读指南顶部的文案和二维码（中英文）；**需要用户给二维码图和群信息** |
| G4 | 新用户第一屏 | 先出方案（草图 + 文字），用户确认后再做：首页突出“继续阅读 / 快速收集 / 本周精选”，发现、热榜、听、看这些入口降低权重 |
| G5 | 每周“值得读的 3 件”草稿 | 一个脚本：从目录的热度和精选数据挑 3 件，生成小红书卡片（复用 `export_guide.py` 的卡片模板）、知乎文章草稿和文案，用户审、改、发；输出在项目外的文件夹，不进站点 |
| G6 | 收录和核心功能页 | 先在 Search Console 抽样看“已抓取未编入索引”的是哪类页面；站点地图只留有独立价值的页；写 3–5 个核心功能页（网页和 PDF 沉浸阅读、RSS 订阅、个人书架和阅读进度），每页写清解决什么问题、适合谁、怎么用，配真实截图，主页和它们互相链接 |

不在这一轮：**G7 匿名“回访”计数**（要在浏览器里记“第一次来的日期”并匿名上报“第几天回来”，隐私政策要同步改）——用户说“暂时不做”。

用户后来定的（2026-11-04）：
- 匿名回访计数：暂时不做。精选图书页顶栏的“最新发布”排序下拉：暂时不动（不藏）。
- “文章顶部”的文案只放在**阅读指南**文章的顶部，别的文章阅读页不放。
- 群二维码图和群信息：等 `claude/music-core`、`claude/books-page` 合并跑完后，用户给；在那之前 G3 的封面和顶部文案先不做（G1、G2 不用等）。

### 开工顺序

1. G1 → G2 → G3（反馈和共读群，一个分支一条线；G3 等二维码图）。
2. G4：先出方案给用户看，确认后做。
3. G5、G6：和前面并行也行，G6 的抽样要用户给 Search Console 的截图或导出。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| G1 | claude | `claude/feedback` · `E:\Ztree\wt\claude-feedback-sd`（在 `shelf-directory` 里） | `feedbackapi.py`、`api/feedback.py`、`adminapi.py`（加一个只读 / 删除的动作）、`docs/admin/admin.js` 和 `index.html`（加“反馈”一页）、`tests/test_feedback.py`、README | `listen.py`、`hotapi.py`、`bookapi.py`（Codex 的在改） |
| G2、G3、G4 | claude | `claude/first-run` · `E:\Ztree\wt\claude-first-run` | `index.html`、`library/notes/guide/index.html` 和 `en/index.html`、封面图、`devtools/e2e/tests/s_feedback.js`（新）、`run_all.ps1`、README、`privacy.html` | 播放器和听歌的函数、热榜函数、翻译词典的长行（新词只加在新行里） |
| G5 | claude | `claude/weekly` · `E:\Ztree\wt\claude-weekly` | 一个新脚本 `weekly_picks.py`（根目录，加进 `seo.py` 的跳过列表和 `.vercelignore`，**绝不上线**） | 其余 |
| G6 | claude | `claude/core-pages` | `seo.py`、新的功能页、`library/` 里的页面 | `index.html` 的大函数 |

### 接口约定（G1 ⇄ G2）

- `POST /api/feedback`，请求 `{"msg": "…≤1000 字", "kind": "bug|idea|content|other", "contact": "…≤80 字，可空", "where": "页面名，≤24 字", "lang": "zh|en", "ver": "页面版本"}` → `{"ok": true}`；错误 `{ok:false, code, zh, en}`（同 `submit` 的写法）：`request` 400、`rate` 429（同一发送者每天最多 3 条）、`full` 503（存满了）、`off` 503（没配 Redis）。
- `GET /api/feedback` → `{"configured": bool}`（页面据此决定显示不显示反馈入口）。
- 不存地址、浏览器信息和时间点（只存日期）；限流用“盐 + 日期 + 地址”的单向散列，只活两天；蜜罐字段 `website` 非空就当作成功但丢弃；同样的内容一天内只收一条；最多存 2000 条，180 天过期；内容原样存、显示时转义，不会被当作 HTML。
- 后台：沿用管理密码的登录（`adminapi`），新动作 `feedback_list`（分页，新的在前）、`feedback_delete`（按 id）；管理页多一个“反馈”标签，写明条数和每条的类型、页面、日期、联系方式。
- 页面：`#feedback` 地址打开反馈小窗；阅读指南里的链接用 `target="_top"` 指向它。

### 验收

- G1：`python -X utf8 -m unittest tests.test_feedback`（格式、限流、蜜罐、去重、上限、过期、转义、后台列出和删除、没配 Redis）和整套测试（只允许之前那 1 个旧失败）。
- G2：`s_feedback.js`（三个入口都能打开小窗；提交成功、失败、限流的提示；没配服务时入口不出现；阅读页和专注模式里没有任何入口；手机和英文各查一遍），进快速集；`wt_run.ps1 -Quick` 全绿。
- G3：预览里“我的书架”的阅读指南卡片封面上有群信息；打开指南，顶部有一句话和二维码；中英文各一份；二维码图的体积（单张 < 100 KB）。
- G4：方案先发用户；做完后看预览，新用户（清空站点数据）打开的第一屏有继续阅读 / 收集 / 本周精选三块。
- G5：跑一次脚本，输出 3 张卡片 + 一份草稿，用户看过。
- G6：Search Console 里相关页面状态有变化（要时间，不是当场能验的）；`seo.verify_site` 通过；站点地图的网址数下降到只剩有用的页。

### 端口

- claude：8800–8899、9440–9449；codex：8900–8999、9450–9459。

### 风险和要避开的冲突点

- 隐私：反馈内容和联系方式是读者主动写的，要在小窗里写明“只有站长看得到，180 天后删除”，隐私政策同步改；不收任何自动采集的信息。
- 二维码：微信群码 7 天过期、满 200 人失效，要用活码或个人号的二维码；手机上没法扫自己屏幕上的码，所以小窗和指南里要有“保存图片”和“复制号码”。
- 平台规则：周更内容里不放暗号、伪装二维码或私信引流；不能放链接的平台就靠关注和系列。
- `index.html` 冲突热点：新词只加在新的 `Object.assign` 行里；更新说明（`CHANGELOG`）只在末尾加一条；`run_all.ps1` 的测试清单一行，合并时要手动留两边。
- 这条线要在 `claude/music-core` 和 `claude/books-page` 合并之后再开分支（从合并后的 `master` 开），免得再处理一轮冲突。

## 3. 进度

### claude

2026-11-05：G1、G2、G3 做完并已合并进两个仓库的 `master`（见“合并记录”）。
- G1 反馈服务（shelf-directory）：`feedbackapi.py`、`api/feedback.py`、审核页“反馈”标签、24 个测试。
- G2 反馈前端（my-archive）：侧栏底部“反馈”链接、小窗、`#feedback`、首次收藏 / 读完一章后一次的轻提示、`s_feedback`（26 项）。
- G3 共读群：QQ 群 869727153（Ai 产品讨论群）。阅读指南（中、英）顶部一张卡片：二维码（`library/notes/guide/img/qq-group.webp`，50 KB）、群号、复制群号、保存二维码、写反馈；“我的书架”里指南那张卡的封面 `library/notes/guide/cover.webp`（1280×800，59 KB，由 `<meta name="archive:cover">` 指定）；反馈小窗里一行群号 + 复制；`s_group`（12 项）。换群的步骤写在 README 第 8 节。
- 没做：G4（新用户第一屏，要先出方案）、G5（周更“值得读的 3 件”草稿脚本）、G6（收录和核心功能页）；G7 用户说暂时不做。

### codex

## 4. 合并记录

- 合并顺序：2026-11-05 用户说“合并”。shelf-directory：`claude/feedback` 已含 `master`，无冲突，`--no-ff` 合并（`8013665`）。my-archive：先把 `master`（已含 `claude/public-simplify` 和 Codex 的热榜）并进 `claude/first-run`，两处冲突都是“两边都留”（`index.html` 里新增的翻译词典行、`run_all.ps1` 的测试清单加上 `s_public_bar`），再 `--no-ff` 合并进 `master`（`aba98e6`）；用户本机 `index.html` 里那一行百度验证 meta 先 `git stash push -- index.html` 再放回，没提交。
- 合并后的测试结果：shelf-directory 全部 734 个，只有 1 条失败（`test_hotdetail` 的 `test_diag_says_why_a_platform_cannot_be_reached_from_here`，以前就有，与反馈无关）；反馈的 24 个单独也全过。my-archive 的 `master` 上快速集 14 个全过（`s_mobile`、`s_lang`、`s_first`、`s_readerui`、`s_text`、`s_dir`、`s_shell`、`s_hot`、`s_dirkeep`、`s_bookpaged`、`s_bookpage`、`s_public_bar`、`s_feedback`、`s_group`）。`s_shell` 里“底栏”那一条改成认 Codex 的底栏：标记里有热榜按钮但手机上隐藏，手机上三个按钮，从左到右是“发现世界、＋、我的书架”（和我自己预览时的左右相反，按用户说的以 `codex/hot-analytics-ui` 为准）。
- 删除的分支和 worktree：`claude/first-run`、`E:\Ztree\wt\claude-first-run`、shelf-directory 的 `claude/feedback`、`E:\Ztree\wt\claude-feedback-sd` 已删。
- 上线前要做：反馈只有 shelf-directory 部署后才有（它需要 Redis 的环境变量，可选 `FEEDBACK_PER_DAY`、`FEEDBACK_KEEP`），没部署前页面上的“反馈”链接不显示，群卡片和封面照常。my-archive 要 `vercel --prod`。
