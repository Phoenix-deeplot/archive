# Sitemap XML 格式化（2026-11-03）

状态：规划中

## 1. 任务清单（用户）

- [ ] 将知树输出的 `sitemap.xml` 调整为清晰、逐行的标准 XML 展示形式，接近 job-helper 的可读格式。
- [ ] 本地构建并校验 XML；部署后再由用户在 Google Search Console 检查是否能够 fetch。

## 2. 规划（Codex）

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| sitemap XML 格式化及本地校验 | codex | `codex/sitemap-xml` · `E:\Ztree\wt\codex-sitemap-xml` | `seo.py`、必要时相关测试；本规划文件 | `index.html`、Vercel 环境变量、线上部署、其他用户未提交文件 |
| 独立审查 | 暂不分配 | — | — | — |

### 接口约定

- `sitemap.xml` 继续使用 XML Sitemap 0.9 的 `<urlset>` 根元素及现有命名空间。
- 每个 `<url>` 内的 `<loc>`、可选 `<lastmod>` 和可选 `xhtml:link` 仍表达现有相同数据，只调整缩进与换行，不改变 URL、日期或 hreflang 语义。
- 输出响应类型维持 `application/xml`；不改 `robots.txt`、URL 收录策略或 canonical 地址。

### 验收

- 运行 `python -X utf8 build_index.py --keep-dates --seo --site-url https://books.zhitree.cn`。
- 用 XML 解析器解析构建产物，检查 `<urlset>`、每个 `<loc>`、`<lastmod>` 与 hreflang 结构，并核对 URL 数量与构建日志一致。
- 静态检查确认 sitemap 文本按元素分行；本地无法验证 Googlebot 的线上抓取。部署需用户明确授权，之后由用户查看 Search Console 状态。

### 端口

- 不需要启动浏览器服务；若需预览，Codex 使用 8920–8999、9450–9459。

### 风险和要避开的冲突点

- 主工作区 `index.html` 有用户未提交修改；开发只能在独立 worktree，不触碰该文件。
- 只将格式化后 XML 当作更易读、易排查；它本身不保证解决 Search Console 的 `Couldn't fetch`。
- 不推送、不部署、不更改线上环境变量。

## 3. 进度

### claude

- 未分配独立实现任务。

### codex

- 检查了当前工作区状态；发现 `index.html` 及若干未跟踪文件/目录均为既有用户改动，保留不动。
- 对比本地 sitemap 生成逻辑和 Vercel 响应头：线上返回 200、`application/xml`；下一步按用户要求只改善 XML 可读格式并本地校验。

## 4. 合并记录

- 合并顺序：待用户确认规划后再创建分支/worktree。
- 合并后的测试结果：待验收。
- 删除的分支和 worktree：待合并后处理。
