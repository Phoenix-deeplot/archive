# 协作规则（Claude 和 Codex 共用）

用户给任务，两个 agent 同时做，各用各的分支和文件夹，做完统一合并。目的：互不覆盖，随时能退回。
`CLAUDE.md` 引用本文件；Codex 读本文件。规则只写一份，改规则要用户同意。

## 流程（每个主题走一遍）

1. **任务清单**：用户给出 checklist。
2. **详细规划**：Claude 写成 `docs/work/<日期>-<主题>.md`（模板见 `docs/work/_TEMPLATE.md`），内容：谁做哪几项、会改哪些文件、不许碰什么、接口约定、验收测试、分支名、端口段。规划文件先提交到 `master`，再开分支，这样每个分支都带着同一份规划。
3. **用户确认规划**。没确认，不开工。
4. **建 worktree**：每个 agent 一个分支、一个文件夹，放在项目外：
   `git worktree add E:\Ztree\wt\<agent>-<主题> -b <agent>/<主题> master`
   分支名：`claude/<主题>`、`codex/<主题>`。
5. **各自开发**：只在自己的 worktree 里改文件；小步提交；不推送、不部署。
6. **全部完成后统一合并**（用户说“合并”再做）：
   1. 每个分支先把最新的 `master` 并进来，冲突在分支上解决；
   2. 跑验收测试；
   3. 依次合并到 `master`（谁后合并，谁处理冲突），再跑一遍测试；
   4. 删掉分支和 worktree（`git worktree remove`、`git branch -d`）；
   5. 要上线时先打标签，如 `deploy-2026-10-30`。

## 硬规则

- 开工前 `git status` 和 `git log -3`。`master` 所在的文件夹（`E:\Ztree\my-archive`）只用来合并，不在里面开发。
- 大改动之前先提交一次：批量替换、整段重写、撤销、迁移文件。出了问题用 `git revert` / `git restore` 退回，不靠手工反向还原。
- 只改自己 worktree 里、规划里分给自己的文件。需要碰别人的文件，先在规划文件里写明，等对方同意。
- 不碰没被跟踪的用户文件（如 `converted/`、`vendor/pdfjs/`）。
- **不推送、不部署、不改线上服务和它的环境变量**，除非用户明确说。密钥不进仓库，也不贴进聊天。
- 分支上的提交属于已批准规划内的工作，可以随时做。合并到 `master` 和推送，要用户说了才做。
- 改接口先改规划文件里的“接口约定”，并通知另一方。

## 仓库

- `E:\Ztree\my-archive`：页面（`index.html` 单文件）、构建（`build_index.py`、`seo.py`）、`serve.py`、`sw.js`、使用指南、README。
- `E:\Ztree\shelf-directory`：公共目录服务端（`listen.py`、`hotapi.py`、`aggregate.py`、`api/`、测试），**是另一个仓库**，同样的流程在它自己的文件夹里做。
- 两个仓库之间只靠接口约定（例如 `/api/listen` 返回的 JSON），约定写在规划文件里。

## 冲突热点（尽量避开）

- `index.html` 约 730 KB，是一个大函数。两边改不同函数能自动合并；**翻译词典是几行超长的单行**，两边各加一个词就会冲突。分给两个 agent 时，尽量不让两边同时往词典里加词，或者约定谁加。
- `README.md`、`library/notes/guide/*` 同一段。
- 改 `index.html` 之后检查：语法能通过、没有重名函数（页面是一个大函数，重名会静默覆盖）。

## 测试

- 页面的浏览器自动测试目前不在仓库里（原来放在临时目录，已经丢失），要先迁进 `devtools/e2e/`。没迁之前，改页面的任务要在规划里写清怎么验证。
- 两个 agent 同时跑测试会抢固定端口：Claude 用 8800–8899、9440–9449，Codex 用 8900–8999、9450–9459。
- `shelf-directory` 的测试：在它的文件夹里，`python -X utf8 -m unittest tests.test_listen`（单个）或列出全部 `tests.test_*` 模块。

## 提交

- 提交信息一句话说清做了什么，中文或英文都行。
- 不要把无关文件混进同一次提交（`git add` 指定文件，不用 `git add .`）。
