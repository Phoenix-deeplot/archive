# 不该上传、不该发布的东西（2026-11-03）

状态：已合并（2026-11-04，用户说“合并”；“不进 git”只拿掉宣传稿）；未推送、未部署

## 1. 任务清单（用户）

- [ ] 把很多不需要的东西加进 ignore；在 Claude 桌面应用的文件 / 改动列表里看到一大堆 md、`devtools` 等和网站无关的文件。
- [ ] 用户选了：**不进 git**、**不上传 Vercel、不发布到网站**。

## 2. 规划（Claude）

### 现状（查过）

- 被 git 跟踪的和网站无关的东西：根目录的 `AGENTS.md`、`CLAUDE.md`、`PROMO.md`、`README.md`，`docs/work/` 的规划文件，`docs/promo/` 的宣传稿，`devtools/e2e/` 的浏览器测试（63 个文件）。
- 网站构建（`seo.py`）已经不发布 `docs/`、`devtools/` 和 `AGENTS.md` 等几个名字固定的文件，**但根目录别的 `.md` 会被原样发布**：构建出来的 `dist/` 里现在就有 `RSS_候选源清单_2026-10.md`（用户自己的内部清单，没被跟踪）；下次 `vercel --prod` 它会出现在 books.zhitree.cn 上。
- `vercel --prod` 没有 `.vercelignore`，按 `.gitignore` 过滤上传，所以 `devtools/`、`docs/` 和所有 md 都会被上传到 Vercel（只是不发布）。
- `.claude/` 不在 `.gitignore` 里（里面现在只有被全局排除的 worktrees）。

### 做什么（这一步，不动 git 里已有的文件）

1. **新增 `.vercelignore`**：有这个文件时 Vercel 不再看 `.gitignore`，所以把 `.gitignore` 的内容抄进去，再加：`devtools/`、`docs/`、根目录的 `*.md`（`/*.md`）、`export_guide.py`、`.claude/`。`vercel.json` 不能忽略；`build_index.py`、`seo.py`、`vendor/`、`icons/`、`library/`、`site.json` 等构建要用的一个都不能忽略。
2. **`seo.py`**：发布时根目录的所有 `.md` 都不复制（以前只排除几个固定的名字）；`verify_site` 多一条：发布目录根上有 `.md` 就停止构建。
3. **`.gitignore`**：加 `.claude/`、`/RSS_*.md`（用户的内部清单，不会再出现在改动列表里，也不会被误提交）。
4. **README** 的部署说明里写清楚上传和发布各排除什么。

### 待你决定：“不进 git”

把 `docs/`、`devtools/`、`AGENTS.md`、`CLAUDE.md` 从 git 里拿掉会让两个 agent 的协作流程坏掉：worktree 只带 git 里有的文件，`devtools/e2e` 的测试不跟着走就没法在分支里验收（上次测试放在 git 之外就丢过一次）；规划文件要先提交到 master 再开分支；Codex 读的 `AGENTS.md` 也要在 worktree 里。所以我建议：

- **保留**在 git 里：`devtools/e2e/`、`docs/work/`、`AGENTS.md`、`CLAUDE.md`、`README.md`。
- **可以拿掉**（只留在本机，`git rm --cached` + `.gitignore`）：`docs/promo/`（三份宣传稿）和 `PROMO.md`。
- 想让应用的文件列表更干净，要把这些工作文件整个搬到网站仓库之外的另一个仓库（比如 `E:\Ztree\my-archive-work`），测试里的路径、两个 agent 的流程、worktree 都要跟着改——这是个大改动，要单独讨论，这一步不做。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| 上面 1–4 | claude | `claude/ignore-noise` · `E:\Ztree\wt\claude-ignore-noise` | `.vercelignore`（新）、`seo.py`、`.gitignore`、`README.md` | 没被跟踪的用户文件（`RSS_候选源清单…md`、`convert.py`、`converted/`、`vendor/pdfjs/`、`devtools/netease-openapi-tester.html`）；codex 的 worktree |

### 验收

- 在工作树根目录放一个临时 `TEST_PRIVATE.md`，构建（`make_demo.py`）出来的站里没有它；`verify_site` 在发布目录根放一个 `.md` 时返回问题。
- 用“`.vercelignore` 排除之后剩下的文件”拷一份到临时目录，直接跑构建命令，构建成功、`dist/` 和不排除时一样。
- `s_seo_sections` 等和构建有关的测试通过；重名函数、语法检查通过。

### 端口

- claude：8800–8899、9440–9449。

## 3. 进度

### claude

- 做完，待用户确认：`.vercelignore`（新）、`seo.py`（发布时根目录的 `.md` 一律不复制；`verify_site` 发现站根上有 `.md` 就停止构建）、`.gitignore`（加 `.claude/`、`/RSS_*.md`）、README 的部署说明。
- 验证（临时目录里的真实构建）：把工作树的文件拷两份，一份全拷（外加一个根目录的 `TEST_PRIVATE.md`），一份去掉 `.vercelignore` 排除的东西，各跑 `build_index.py --keep-dates --seo`：两次都成功，`dist/` 都是 110 个文件、一模一样，`TEST_PRIVATE.md` 没有被发布；`verify_site` 对好的 `dist` 返回空、对站根上多出一个 `.md` 的 `dist` 返回问题。
- 没跑浏览器测试：改的只是构建和忽略文件，没有动页面；而且用户正在 8820 的预览上检查，重启测试会把它关掉。合并前再跑 `s_seo_sections`。
- “不进 git”还没做，等用户决定（见上）。
- 2026-11-04（用户同意只拿掉宣传稿）：`git rm --cached` 了 `docs/promo/`（宣传稿、图片、`render.py`）和 `PROMO.md`，`.gitignore` 里加了 `/PROMO.md`、`docs/promo/`；文件留在本机。**合并时 git 会把它们从 master 的文件夹里删掉**，所以合并前备份到了 `E:\Ztree\my-archive-private-backup\`（`docs-promo\`、`PROMO.md`，已核对内容一致），合并后放回原处（那时它们是被忽略的、不进 git 的）。

## 4. 合并记录

- 合并顺序（2026-11-04，`--no-ff`，没推送、没部署）：`claude/ignore-noise` → `claude/test-speed` → `claude/test-settle` → `claude/app-like-loading`；每个分支合并前先并入最新 master（只有 `app-like-loading` 有一处冲突：`run_all.ps1` 里测试列表那一行，取 master 的新版本再把 `s_dirkeep` 加进整套列表）。
- 合并后的测试结果：整套 `run_all.ps1`（在并入全部三个先合的分支之后的 `app-like-loading` 上跑）29 个测试、0 个新的失败、4 行已知失败（`s_read` 停在第 92 行、`s_reco` 两项、`s_sync` 的 B 项）、用时 24.6 分钟；Codex 的 `s_reader_usability` 12 项通过；合并到 master 之后的快速集（`-Quick`）10 个测试全部通过，用时 7.4 分钟。这个分支自己的验证：临时目录里的真实构建（全拷 / 去掉 `.vercelignore` 排除的东西）都成功、`dist` 一模一样、根目录的 `.md` 不发布，`s_seo_sections` 38 项通过。
- 删除的分支和 worktree：`claude/ignore-noise` 和 `E:\\Ztree\\wt\\claude-ignore-noise`。
- 合并时的一处手工：合并会把 `docs/promo/` 和 `PROMO.md` 从 master 的文件夹里删掉（它们已退出 git），合并前备份到 `E:\\Ztree\\my-archive-private-backup\\`、合并后放回原处，逐字节核对一致；现在它们被 `.gitignore` 忽略。备份文件夹可以由用户自己删除。
- 上线要用户做：下一次 `vercel --prod` 起就按 `.vercelignore` 上传（不再带 `devtools/`、`docs/`、根目录的 md）；根目录的 `RSS_候选源清单_2026-10.md` 不会发布了。
