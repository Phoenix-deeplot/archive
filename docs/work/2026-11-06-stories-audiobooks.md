# 故事播客、有声书（2026-11-06）

状态：已确认（用户 2026-11-06：“先给出设计，没问题直接开始”；有声书只做有授权的，先做轻量版）；开发中；未推送、未部署

## 1. 任务清单（用户）

- [ ] 加一些故事类播客（例如鲶鱼夜话、蓬莱夜话），参考荔枝 FM、喜马拉雅、小宇宙等应用的订阅；最好能集成不同平台的热门，按不同风格推荐。
- [ ] “推荐订阅”里新增一组故事类；再挑几个收进公共目录，目录里加“故事”标签。
- [ ] 有声书放在“书籍”里面；经典 + 故事风格；有成熟的订阅或 API 就直接用。
- [ ] 有声书先做有授权的（公版、电台自己的节目）；先做轻量版：风格推荐和热门推荐。

## 2. 规划（Claude）

### 查到的事实（2026-11-06 实测）

- 喜马拉雅、荔枝 FM、小宇宙、故事 FM 的节目都有公开的订阅地址（RSS）：`ximalaya.com/album/<id>.xml`、`rss.lizhi.fm/rss/<id>.xml`、`feed.xyzfm.space/<id>`、`feeds.storyfm.cn/storyfm.xml`。读得到，声音（`jt.ximalaya.com`、`cdn.lizhi.fm`、`tk.wavpub.com`）不要 Referer、支持 Range，页面的播放条能直接放（公共目录里已经有喜马拉雅的节目在放）。
- Apple 播客的“中国”分类榜（小说 1483、犯罪纪实 1488、历史 1462、社会与文化 1324）里，大半是喜马拉雅和小宇宙的节目；Apple 的查询接口对每个节目给 `feedUrl`，**用 `feedUrl` 的域名就能认出它来自哪个平台**——所以“各平台的热门”不用接任何平台的私有接口：用 Apple 的榜单当“热”的信号，用域名分平台。荔枝的节目很少上榜，靠手选。
- “鲶鱼夜话”（正名，不是“鲇”）：喜马拉雅，304 期，恐怖奇谈 / 犯罪纪实。**“蓬莱夜话”没查到**（Apple 三个地区都没有，网上也搜不到），等用户给链接或平台。
- 现成的订阅机制：`recommended.json` 的“推荐订阅”页已有两组播客（`podcasts-zh`、`podcasts`，每个都能先“试听”再订阅）；公共目录的 `registry/shelves.json`（`kind: feed`）；“目录里的节目”在“今日听什么 → 播客”。
- 有声书的来源：LibriVox（公版，成熟的 API 和 RSS，声音在 archive.org，英文为主，没有中文书）；香港电台《有聲好書》（电台自己的节目，962 期）；《红楼梦》（公版文本，个人音色 AI 朗读，199 个文件）。平台上的网络小说“多播有声书”授权不清，**不收**（也不进故事榜单）。

### 有声书和播客有什么不同（所以不能只当播客订阅）

| | 播客 | 有声书 |
|---|---|---|
| 顺序 | 新的在前，一集一集追更 | 第 1 章在前，有头有尾 |
| 听的方式 | 随便点一集 | “接着听”：记住听到哪一章、哪一秒；放完一章自动放下一章（往后） |
| 条数 | 只留最近几十期 | 整本都要（《红楼梦》199 个文件） |
| 页面里 | 播客榜 / 目录里的节目 | 在“精选图书”里，是一本书：封面、作者、朗读者、章数、总时长 |

### 做什么

**S1 故事播客**（后端 `shelf-directory`，新模块 `stories.py`，接线在 `listen.py`；只给带 `caps=resolve` 的页面）
1. 手选名单 `registry/stories.json`：每个节目 `{id, name, name_en, platform, style, feed, apple_id, lang, why}`，只收**实测过订阅地址读得到、声音放得出来、在更新**的；风格：悬疑怪谈、真实故事、历史野史、睡前故事、评书。
2. 目录里新增的播客列表（`type: podcast`，`lang: zh`）：
   - 风格：`st-mystery` 悬疑怪谈、`st-true` 真实故事、`st-history` 历史野史、`st-sleep` 睡前故事、`st-pingshu` 评书；
   - 平台热门：`st-hot-ximalaya` 喜马拉雅·故事热门、`st-hot-xiaoyuzhou` 小宇宙·故事热门、`st-hot-lizhi` 荔枝FM·故事热门。
   每个列表是“每个节目的最新一集”（和现有播客榜一样，整集可放）。内容 = 手选名单 + Apple 中国榜（犯罪纪实 1488、小说 1483、社会与文化 1324、历史 1462）里**名字带故事类关键词**的节目（夜话 / 怪谈 / 怪奇 / 悬疑 / 档案 / 侦探 / 睡前 / 晚安 / 故事 / 野史 / 评书 / 单口 …），平台用 `feedUrl` 的域名认；名次按榜单名次，手选的排在同平台榜单的前面或补在后面；风格按关键词和手选名单分。
3. 页面（`my-archive`）：这些列表在播客一侧的标签条里排在最前（`st-` 开头的先），不另做页面；`archive` 里不存任何东西。

**S2 推荐订阅 + 公共目录**
4. `recommended.json` 新增一组 `stories-zh`“故事 · 悬疑 · 睡前”（`podcast: true`，每个能先试听再订阅），12–15 个，来自手选名单。
5. 公共目录 `registry/shelves.json` 里收其中 6–8 个，带“故事”标签（同时在 `tags.json` 加这个标签）；它们的快照用现有的取数命令生成。

**A1 有声书（后端）**
6. 手选名单 `registry/audiobooks.json`：每本 `{id, title, title_en, author, narrator, lang, style, rights, source, feed, order, cover, summary, n, secs, hot}`；`rights`：`public-domain`（公版）或 `broadcaster`（电台自己的节目）；`order`：`asc`（订阅地址里已经是第 1 章在前）或 `desc`（新的在前，要倒过来）；首批：LibriVox 的经典 + 故事风格 12 本（福尔摩斯、爱丽丝梦游仙境、傲慢与偏见、简·爱、格林童话、伊索寓言、基督山伯爵、科学怪人、德古拉、坎特维尔的幽灵、爱伦·坡短篇、一千零一夜），加香港电台《有聲好書》和《红楼梦》。“热门”= 手选时按 archive.org 的下载次数排好的次序（`hot` 记名次，不在运行时去问）。
7. 新接口：`GET /api/listen?books=1&lang=` → 目录；`GET /api/listen?book=<id>` → 这本书的全部章节（读订阅地址、按 `order` 排成第 1 章在前，暖实例里留 6 小时，CDN 留一天；读不到时给最近一份，带 `stale`）。

**A2 有声书（页面）**
8. “精选图书”页的类别那一排多一个“有声书”（和现有类别一样的小标签）；选它时下面是有声书的卡片（封面、书名、作者 · 朗读者、章数 · 时长），上面一排风格标签（经典名著 / 故事悬疑 / 童话寓言 / 中文），“热门”排前面。
9. 点一本：书的页面（返回箭头、封面、简介、授权说明、“接着听 / 从头听”、章节列表第 1 章在前，每章写时长和听过的进度）；点一章 = 这本书的章节成为播放条的列表，从这章往后放，放完一章自动放下一章；有倍速和 −15 / +30（和播客一样）。
10. 记住听到哪里：`archive.abLast`（书 → 章号）和现有的 `plProg`（每章的进度）；再进这本书“接着听”从上次的章和秒开始；“清除这台设备上的听歌记录”也清掉。

### 接口约定

```
GET /api/listen?lang=zh&caps=resolve  -> groups 里多：
   { id: 'st-mystery'|'st-true'|'st-history'|'st-sleep'|'st-pingshu'|'st-hot-ximalaya'|'st-hot-xiaoyuzhou'|'st-hot-lizhi',
     name, name_en, kind: 'list', type: 'podcast', lang: 'zh', net: 'cn', region: 'cn' }
GET /api/listen?g=st-xxx             -> 和现有播客榜一样：每个节目的最新一集 {id:'pc:…', title, artist: 节目名, cover, dur, audio, url, show, date, from, plat?}
GET /api/listen?books=1&lang=        -> { ok, styles: [{id, name, name_en}], books: [{id, title, title_en, author, narrator, lang, style: [..], rights, source, cover, summary, n, secs, hot}] }
GET /api/listen?book=<id>            -> { ok, stale?, book: {…同上…, chapters: [{n, title, audio, dur}]} }   (n 从 1 起，第 1 章在前)
```
- 都是**新增**，旧页面不带 `caps=resolve` 时目录和榜单一字不变。
- 声音地址只收 https（http 的改写成 https，改不了的丢掉），章节最多 600 章，标题当文本。
- 环境变量：不新增；`LISTEN_DISABLE` 可关单个榜单。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| S1、S2 的目录和订阅数据、A1（后端） | claude | `claude/stories` · `E:\Ztree\wt\claude-stories-sd`（shelf-directory） | `stories.py`、`audiobooks.py`（新）、`listen.py`（接线）、`registry/stories.json`、`registry/audiobooks.json`、`registry/shelves.json`、`registry/tags.json`、`registry/snapshots/` 里新增节目的快照、新测试、README | `hotapi.py`；数据库迁移；线上环境变量；用户的 `.gitignore` 修改 |
| S1 的页面、S2 的推荐订阅、A2 | claude | `claude/stories` · `E:\Ztree\wt\claude-stories`（my-archive） | `index.html`（`lp*` 播客一侧的顺序、`dirBooksHeadHTML` 一带、新的有声书函数 `ab*`）、`recommended.json`、`devtools/e2e/services/sync_dev.py`（假服务）、新测试、README、`library/notes/guide`、`CHANGELOG` | 翻译词典里现有的超长单行；热榜页函数；阅读器；codex 的 worktree；没被跟踪的用户文件 |

### 验收

- 后端：新测试模块 `tests.test_stories`（固定样本、不联网）：各平台域名认得对；故事关键词筛选和风格分类；手选名单坏条目被跳过；每个新列表的条目格式；`?books=1`、`?book=` 的章节顺序（`asc` / `desc`）、读不到时给最近一份、章节上限、http 地址的改写；旧页面（不带 `caps=resolve`）目录和榜单与以前一字不同；整套 `tests.test_*` 通过。
- 手选名单每一项都实测过：订阅地址读得到、第一期和最后一期的声音地址 HEAD / Range 通（脚本在 `devtools` 里留一份，下次加名单时再跑）。
- 页面：新测试 `s_stories`（播客一侧的故事列表排在最前、点一集能放；推荐订阅里有“故事 · 悬疑 · 睡前”一组）、`s_audiobook`（精选图书里的“有声书”标签和卡片、进书、从头听 / 接着听、第 1 章在前、自动放下一章、记住进度、清除记录）；旧的 `s_listen`、`s_music_*`、`s_bookpage`、`s_books`、`s_dir` 不退步；整套 `run_all.ps1` 合并前跑一遍。
- 预览：8830 端口；给你看的时候写清楚地址和点哪里。

### 端口

- claude：8800–8899、9440–9449。

### 风险和要避开的冲突点

- **版权**：平台榜单里大量“多播有声书 / 小说”是网络小说的朗读，授权不清；故事列表用关键词筛掉小说类（`小说 / 有声书 / 多播 / 穿越 / 重生 …`），有声书只收公版和电台自己的节目。播客节目是作者自己发布的订阅地址，我们只是列出和放（声音不经过本站），和 Apple 播客的做法一样。
- **平台识别靠域名**：平台改了订阅地址的域名就认不出，那一个节目落到“其他”，不影响别的。
- **订阅地址很大**（故事 FM 1000 期 4.4 MB）：播客榜只通过 Apple 的查询接口取最新一集，不读整个订阅；只有有声书的 `?book=` 读整个订阅（`_get` 最多读 2 MB：超出的章节不要，书的目录里写的章数以读到的为准，手选时挑 2 MB 以内的）。
- **冲突热点**：`index.html` 里只动 `lpOrder`（播客一侧的顺序）和精选图书那一带，新函数用新名字前缀 `ab`；新词只加新的一行 `Object.assign`。
- **《蓬莱夜话》**没查到，先不收；用户给了链接再加。

## 3. 进度

### claude

## 4. 合并记录

- 合并顺序：
- 合并后的测试结果：
- 删除的分支和 worktree：
