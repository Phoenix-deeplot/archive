# RSSHub 添加与收录入口（2026-11-07）

状态：待用户确认；本计划仅涵盖前端入口提示，不改订阅数据结构或 API 合同。

## 1. 任务清单（用户）

- [ ] 用户在添加或收录时粘贴 RSSHub 链接，能够识别为可更新订阅，并继续走预览、确认订阅、首次更新。
- [ ] 仍允许用户把原链接仅作为单篇链接收录；粘贴地址时不得静默订阅。

## 2. 规划

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| 本仓库前端入口和 E2E | Codex implementation agent | `codex/rsshub-subscription-entry` · `E:\\Ztree\\wt\\codex-rsshub-selfhost-archive` | `index.html` 添加/收录流程、必要的 `devtools/e2e/` 用例、本规划 | `manifest.js`、`manifest.json` 未提交用户改动；阅读器、翻译词典、音乐、推荐排序、订阅存储格式 |
| shelf-directory RSSHub 运行时 | Codex implementation agent | `codex/rsshub-selfhost` · `E:\\Ztree\\wt\\codex-rsshub-selfhost-api` | 见 shelf-directory 对应同名规划 | 本仓库页面和用户本地文件 |

### 接口约定

继续使用目录配置中的 `feed_api`，POST `/api/feed`：

`{"action":"discover","url":"rsshub://... 或 RSSHub feed URL"}`

可订阅成功时响应保持 `kind:"feed"`、`feed`、`items`、`resolution`；前端显示标题、来源范围和近期内容。用户确认后保存 `feed` 地址并沿用原有 `action:"update"` 流程。无需新增数据库、修改目录 JSON 或改订阅结构。

“添加 → 订阅”继续使用现有查找按钮。“收录”框只在粘贴 RSSHub scheme/已知 RSSHub URL 时显示“识别到可更新订阅源 / 按订阅解析”入口；点击后切换到订阅页并带入 URL。不能自动完成订阅。

### 验收

- 普通博客/单篇文章的收录体验不变。
- 在订阅页输入 `rsshub://<route>` 或自托管 RSSHub URL，查找返回真实 feed 预览，确认后首次更新成功。
- 在收录框输入 RSSHub 地址时可显式跳转订阅解析；可取消跳转并保留为普通链接收录。
- 无效/被限制的 route 显示后端原因；不显示“订阅成功”。
- E2E 使用 8900–8999、9450–9459，测试 Preview API 与移动端输入布局；修改后检查 `index.html` 语法和重复函数。

### 端口

- Codex：8900–8999、9450–9459。

### 风险和要避开的冲突点

- 运行时 RSSHub endpoint 由 shelf-directory 提供；其 Preview 未就绪前，只能测前端跳转与失败反馈。
- 不改翻译词典超长单行；不触碰未提交的 `manifest.js`、`manifest.json`。

## 3. 进度

### Codex

- 已审查现有前端：订阅页已有 `/api/feed` discover；普通收录入口尚未提供 RSSHub 到订阅的明确入口。
- 当前等待 shelf-directory RSSHub 自托管方案与本计划得到用户确认。

## 4. 合并记录

- 待实施与用户验收。
