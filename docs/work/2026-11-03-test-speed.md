# 回归测试看得清、可以先跑快的（2026-11-03）

状态：已合并（2026-11-04，用户说“合并”）；未推送、未部署

## 1. 任务清单（用户）

- [ ] 为什么每次回归测试这么久：先让每个测试花了多少时间看得见，已知会失败的三个测试标出来，再给一个日常用的快速集。

## 2. 规划（Claude）

### 现状（量过）

- 35 个测试文件、1174 项检查；测试代码里写死的 `sleep(…)` 加起来 942 秒（约 16 分钟），整套一般跑 27–40 分钟。
- `run_all.ps1` 只在开头和结尾写时间，每个测试花了多久没有记；已知在 master 上就有失败项的三个（`s_read`：目录里找不到测试塞进去的那篇文章，第 92 行；`s_reco`：两项；`s_sync`：一项 B）和新出现的失败混在一起，每次要人去分。

### 做什么

1. **每个测试记耗时**：`all.out` 里每行末尾写 `(N 秒)`，结尾写总用时和最慢的五个。
2. **已知失败标出来**：`run_all.ps1` 里有一张“已知会失败”的表（测试名 → 原因 / 哪几项），整套仍然跑它们（它们大部分检查是好的），输出里在这些行前加 `known:`，并且汇总行分开写“新的失败 N 个 / 已知的 M 个”；表里的原因写清楚，谁修好了就从表里拿掉。
3. **`-Quick` 快速集**（目标约 5 分钟）：`s_mobile`、`s_lang`、`s_first`、`s_readerui`、`s_text`、`s_dir`、`s_shell`、`s_hot`、`s_dirkeep`、`s_bookpaged`；不含重启浏览器的、改共用目录数据的、已知失败的；`-Skip a,b` 可以再去掉几个。日常改动先跑它（或者只跑相关的几个），整套留到合并前。
4. README（`devtools/e2e/README.md`）里写用法和这几条约定。

### 不做（以后）

- 把写死的等待换成条件等待（第 2 项）、两套浏览器并行（第 3 项）。

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| 上面 1–4 | claude | `claude/test-speed` · `E:\Ztree\wt\claude-test-speed` | `devtools/e2e/run_all.ps1`、`devtools/e2e/README.md` | 测试本身；`index.html`；codex 的 worktree |

### 验收

- `run_all.ps1 -Only s_lang,s_tips`：日志每行有耗时，结尾有总用时和最慢的；`-Only s_read` 的失败行带 `known:`，汇总里算“已知的”。
- `run_all.ps1 -Quick` 完整跑一遍，记下用时（目标约 5 分钟），全部通过。
- 不带参数的整套在合并前再跑一次，行为和以前一样（顺序、重启浏览器的位置不变）。

### 端口

- claude：8800–8899、9440–9449。

### 风险和要避开的冲突点

- 运行 `run_all.ps1` 会重启浏览器和假服务，所以不能和别的回归同时跑（我这边现在有一轮在跑，等它结束再验证）。
- 已知失败表里要写到“哪几项”：整个测试都标成已知的话，新增的失败会被藏起来。所以标记按失败行的文字匹配，不是按测试名。

## 3. 进度

### claude

（开发中）

## 4. 合并记录

- 合并顺序（2026-11-04，`--no-ff`，没推送、没部署）：`claude/ignore-noise` → `claude/test-speed` → `claude/test-settle` → `claude/app-like-loading`；每个分支合并前先并入最新 master（只有 `app-like-loading` 有一处冲突：`run_all.ps1` 里测试列表那一行，取 master 的新版本再把 `s_dirkeep` 加进整套列表）。
- 合并后的测试结果：整套 `run_all.ps1`（在并入全部三个先合的分支之后的 `app-like-loading` 上跑）29 个测试、0 个新的失败、4 行已知失败（`s_read` 停在第 92 行、`s_reco` 两项、`s_sync` 的 B 项）、用时 24.6 分钟；Codex 的 `s_reader_usability` 12 项通过；合并到 master 之后的快速集（`-Quick`）10 个测试全部通过，用时 7.4 分钟。这个分支自己的验证：`-Only` 八个测试的耗时日志、`known` 标记、汇总和“最慢的五个”都正常；`-Quick` 第一次完整跑 7.3 分钟（目标是 5 分钟，没达到：快速集里 `s_mobile`、`s_first`、`s_readerui`、`s_lang`、`s_hot` 还没换成安静等待）。
- 删除的分支和 worktree：`claude/test-speed` 和 `E:\\Ztree\\wt\\claude-test-speed`。
