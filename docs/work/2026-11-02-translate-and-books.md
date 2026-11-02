# 文章翻译 + 精选图书（有声书、小说）（2026-11-02）

状态：**规划中，等用户确认**。确认后才建分支和 worktree。

## 1. 任务清单（用户）

- [ ] 1. 自动接入文章翻译（用户已有 DeepL 和阿里云的通用翻译 API key）。
- [ ] 2. 接入一些有声书和小说，精品书单放进“精选图书”，可以打开并阅读。

## 2. 规划（Claude）

### 先说清的几条规矩

- **密钥只由用户自己设**：`DEEPL_API_KEY`、`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET` 由用户在 Vercel 项目（shelf-directory）的环境变量里设，每日构建要用的同名项设在 GitHub 仓库的 Secrets 里。我不看、不要、不写进仓库，代码里只从环境变量读。
- **只收公有领域或作者自己免费授权的内容**：书和有声书都记下来源和许可；不接 Z-Library 之类的盗版站，也不抓付费墙后面的内容。
- **目录不存全文**这条原则不变：书只记标题、作者、摘要、封面、章节目录和回原站的链接；点开才去原站（或原站提供的订阅源）读取。
- **翻译会把文章文字发给第三方**（DeepL / 阿里云），所以：只在读者点“翻译”以后才发，隐私政策和关于页要照实写，自己添加的文件第一次点要先确认。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| A. 翻译服务：新增 `api/translate.py`，`translate.py` 加阿里云、双服务商切换和额度保护 | claude | shelf-directory：`claude/translate-api` · `E:\Ztree\wt\claude-translate-api` | `api/translate.py`（新）、`translate.py`、`.env.example`、`vercel.json`（路由，如需要）、`tests/test_translate.py`、README | `listen.py`、`tests/test_listen.py`（Codex 的 Bilibili / 波点计划在改）、线上环境变量 |
| B. 阅读页的“翻译”按钮（双语对照） | claude | my-archive：`claude/translate-ui` · `E:\Ztree\wt\claude-translate-ui` | `index.html`（阅读器部分；新词用 `Object.assign(I18N…)` 加）、`privacy.html`、`about.html`、`devtools/e2e/tests/s_translate.js`（新）、README | 播放器、今日听什么相关函数（Codex 计划里“仅必要的播放器兼容”会碰） |
| C. 精选图书的数据和阅读：`registry/books.json`、构建时生成书籍条目和章节目录 | claude | shelf-directory：`claude/books-data` · `E:\Ztree\wt\claude-books-data` | `registry/books.json`（新）、`aggregate.py`（书的部分）、`SHELF-SPEC.md`、`tests/test_aggregate.py`、`tests/test_books.py`（新）、README | 同 A |
| D. 精选图书页：书卡片、章节目录、阅读、收听（有声书） | claude | my-archive：`claude/books-ui` · `E:\Ztree\wt\claude-books-ui` | `index.html`（精选图书、阅读器的“上一章 / 下一章”）、`seo.py`（精选图书页是否收录）、`devtools/e2e/tests/s_books.js`（新）、README | 同 B |

顺序：A → B（翻译，可单独上线）；C → D（书，可单独上线）。每一步做完等你说“合并”再合并，**都不推送、不部署**。两件事互不依赖，你想先要哪一个，我就先做哪一个。

### 接口约定

#### 翻译（A ↔ B）

`POST https://adminbook.zhitree.cn/api/translate`（只接受 `ALLOWED_ORIGINS` 里的网站）

```json
请求：{"to": "zh" | "en", "from": "auto" | "en" | "zh" | …, "texts": ["第一段", "第二段"]}
成功：{"ok": true, "provider": "deepl" | "aliyun", "texts": ["…", "…"], "cached": 3, "left": {"day": 12000}}
失败：{"ok": false, "error": "quota" | "limit" | "toolong" | "nokey" | "fail", "message": "给读者看的一句话"}
```

- 一次最多 50 段，每段 ≤ 1500 字，一次总共 ≤ 8000 字；超过返回 `toolong`。
- `GET /api/translate` → `{"ok": true, "service": "shelf-translate", "configured": true, "providers": ["deepl","aliyun"], "day_chars": 30000}`（没配 key 时 `configured:false`，页面不显示翻译按钮）。
- 服务商顺序：默认 DeepL 优先，失败或额度用完（DeepL 的 456）自动换阿里云；`TRANSLATE_PROVIDER=aliyun` 可以反过来。阿里云用“机器翻译 · 通用版”（`TranslateGeneral`，AccessKey 签名，标准库实现，不加依赖）。
- 额度保护（防止别人刷光你的额度）：每个访客（IP 加盐哈希，沿用现有做法）每天 `TRANSLATE_DAY_CHARS`（默认 30000 字）；整站每月 `TRANSLATE_MONTH_CHARS`（默认 800000 字，低于两家的免费额度）；计数放在现有的 Upstash（和同步、统计同一个）。没有 Upstash 时只做单次大小限制并说明。
- 缓存：服务端按“原文哈希 + 目标语言”缓存译文（Upstash，保留 90 天）；浏览器里再缓存一份（IndexedDB），同一篇文章只付一次钱。
- 日志里不记录原文，只记长度和服务商。

#### 书（C ↔ D）

`registry/books.json`（人工维护的精选书单）：

```json
[{"id": "hongloumeng", "title": "红楼梦", "author": "曹雪芹", "lang": "zh", "kind": "novel",
  "summary": "一两句话的介绍", "image": "https://…（https，可空）", "tags": ["小说", "古典"],
  "license": "public-domain", "source": "zh.wikisource.org",
  "read": "https://zh.wikisource.org/wiki/紅樓夢",
  "chapters": {"from": "wikisource", "prefix": "紅樓夢/"}     // 或 [{"t": "第一回", "u": "https://…"}]
  "audio": {"feed": "https://librivox.org/rss/47", "from": "librivox"}}]  // 可空
```

- 构建时（每日 Action）：`chapters.from` 为 `wikisource` / `standardebooks` 的自动读出章节列表（最多 200 章，读不到就只留 `read`）；有 `audio.feed` 的不在构建时读声音，只记订阅源地址。
- 进 `directory.json` 的条目：`type: "book"`，`shelf: "books"`（书架名“精选图书”），新增可选字段 `toc: [{"t","u"}]`（章节标题和地址，已有的 `toc` 字符串数组仍然兼容）、`audio_feed`（有声书订阅源）、`license`。这些字段缺了页面也照常工作。
- 页面：精选图书页列出书卡片（封面、书名、作者、“小说 / 有声书 / 中文 / English”标签）；点“阅读”打开章节目录，再点章节在站内阅读器里读（走现有的 `feed` 接口读页面，上一章 / 下一章沿用阅读器的前后翻）；点“收听”把有声书的订阅源（LibriVox 的 RSS）用现有播客播放器播放，整本进播放列表。

### 首批书目（草案，确认后我再逐条核对来源能打开、许可对）

- **中文小说**（中文维基文库，公有领域）：红楼梦、西游记、三国演义、水浒传、儒林外史、聊斋志异（选）、鲁迅《呐喊》《彷徨》《朝花夕拾》等，约 15 部。
- **英文小说**（Standard Ebooks，每章一页、适合在线读；公有领域）：傲慢与偏见、爱玛、简·爱、弗兰肯斯坦、德古拉、福尔摩斯探案、爱丽丝梦游仙境、金银岛、基督山伯爵、了不起的盖茨比等，约 20 部。
- **有声书**（LibriVox，公有领域志愿者朗读，每本有 RSS）：和上面英文小说对应的版本，约 20 本。
- **中文有声书**：LibriVox 上中文很少。可选做法：用苹果播客搜索接口找“作者自己免费发布 RSS 的有声书播客”，逐个核对后再收；**第一批可以先不做**，等你定。

### 验收

- A：`python -X utf8 -m unittest tests.test_translate`（假的 DeepL / 阿里云服务器：成功、额度用完换服务商、两家都失败、超长、限流、没配 key、签名正确、日志不含原文、不接受别的网站来源）；整个 `tests.test_*` 不退步。
- B：`devtools/e2e/tests/s_translate.js`：英文文章出现“翻译”按钮，点后每段下面出现译文，可切“双语 / 只看译文 / 原文”，再点不重复请求（缓存），额度用完有提示，没配 key 不显示按钮，PDF 不显示按钮，自己的文件第一次先确认；整套 e2e 不退步。
- C：`tests/test_books.py` + `tests.test_aggregate`：`books.json` 校验（缺字段、坏地址、没许可就拒绝），章节列表生成，`directory.json` 里书的字段。
- D：`devtools/e2e/tests/s_books.js`：精选图书页有书卡片，点阅读 → 章节 → 打开一章，上一章 / 下一章，点收听出现播放条；整套 e2e 不退步。
- 预览：用测试环境（8820 端口）看；真实内容要等 shelf-directory 推送并构建以后，线上才有。

### 端口

- claude：8800–8899、9440–9449。

### 风险和要避开的冲突点

- **额度被刷**：靠每访客每天的字数限制、整站每月上限、缓存；仍可能被恶意消耗一部分，所以上限默认比免费额度低。
- **隐私**：翻译发出的是文章文字，不含读者信息；隐私政策要改；服务端不保存原文。
- **版权**：只收公有领域和明确免费授权的内容，每条记录许可和来源；有疑问的不收。
- **阅读器处理长文**：一章太长时只翻译前 3 万字并提示；PDF 不翻译（画布里没有文字）。
- **冲突**：Codex 的 `2026-11-01-bili-bodian-listen.md` 在改 shelf-directory 的 `listen.py`、`tests/test_listen.py` 和 README，index.html 只碰必要的播放器兼容。我的 A、C 不碰 `listen.py`；README 各加各的一小段；index.html 里翻译（B）在阅读器区，书（D）在精选图书区，新字符串走 `Object.assign(I18N…)`，避免两边都往词典大行里加词。
- 书的“收听”用现有播客播放器，D 不改播放器本身。

## 3. 进度

### claude

### codex

## 4. 合并记录

- 合并顺序：
- 合并后的测试结果：
- 删除的分支和 worktree：
