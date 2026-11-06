# 订阅添加升级（2026-11-06）

状态：待确认；完成现状检查后，用户确认此清单再开始业务代码修改。

## 1. 任务清单（用户）

- [ ] 用户粘贴不同平台、API 和协议链接，识别是否可以持续订阅。
- [ ] 优先查找原生 RSS / Atom / JSON Feed；平台适配后再尝试配置的 RSSHub。
- [ ] 测试实际可读性，显示已验证支持、条件支持和暂不支持的范围。
- [ ] 不把单篇收录、站内播放和持续订阅混为一谈。

## 2. 规划

### 分工及文件边界

本轮由 Codex 负责实现，Claude 不分配新任务。两个仓库分别使用 codex/subscription-discovery 分支和独立 managed worktree。

| 仓库 | 可修改文件 | 不许碰 |
|---|---|---|
| my-archive | index.html 的订阅添加函数；devtools/e2e/ 下订阅添加测试；本规划及订阅支持说明 | 翻译词典超长行、音乐播放、阅读器、推荐算法、埋点、未跟踪文件 |
| shelf-directory | 新建 feedresolver.py；feedapi.py；tests/test_feedresolver.py；必要的 tests/test_feedapi.py；.env.example；本仓库对应规划 | aggregate.py 的公共采集行为、运营数据库、音乐 API、路由入口数量、密钥和部署配置 |

### 功能边界

1. 规范化 feed://、webcal://、itpc://、podcast:// 中带有真实 Feed 地址的链接；rsshub:// 仅映射到管理员配置的 RSSHUB_BASE。其他应用私有协议只做明确识别，不猜测 URL。
2. 原生 RSS、Atom、JSON Feed 和网页 alternate feed 保持兼容；补文章页的显式订阅发现，订阅前显示来源范围及近期条目，避免用户误以为只订阅当前文章。
3. pod.link 和 Apple Podcasts 节目页优先根据节目 ID 经 Apple lookup 获取 feedUrl，再验证真实 Feed；不把单集地址当节目订阅。尽力从 pod.link 页面显式链接发现 RSS。
4. GitHub 仓库提供 releases.atom / commits 对应的明确更新类型，不把整个源码仓库当文章 RSS。
5. 保留 YouTube 原生频道/播放列表订阅；补 @handle 的显式 channel ID / feed 发现，单视频仍为单篇收录。
6. 首批 RSSHub 平台适配仅纳入核实过的频道/作者路由，例如 B 站 UP；RSSHUB_BASE 由站长提供，验证成功才允许订阅。X、小红书、知乎等需要实例配置或登录的平台返回条件与失败原因。
7. 任意 JSON API 不自动假设字段结构；标准 JSON Feed 可用，私有 API 提示需要专用适配器。音乐歌单/单曲不假装成持续订阅或获得播放授权。
8. 失败时区分登录/访问限制、找不到订阅、源失效、协议不支持、RSSHub 未配置；允许安全 HTTP(S) 链接仅收录，补充帮助操作。

### 接口约定

继续使用 POST /api/feed：{action: discover, url: string}，保留 kind=feed/link 和现有字段。
可选新增 resolution（原始链接、识别的平台、解析方式、订阅范围）、suggestions（已发现候选源或下一步操作）、诊断 reason。候选地址全部由服务端重新验证；不接受用户指定任意请求头、Cookie 或密钥。
feedapi.handle 将 env 传入 discover；直接调用 discover(raw) 保持可用。
更新继续使用原 /api/feed action=update；解析后的真实源保存到 c.feed.url，沿用现有刷新、去重与本地缓存。

### 验收

- 隔离测试覆盖协议、链接形状、平台识别、Feed 验证、失败分类、超时、SSRF 和候选注入。
- 回归 tests.test_feedapi、tests.test_aggregate、tests.test_api_router；前端语法与重名函数检查。
- 页面验证：粘贴、查找、查看结果、确认订阅、重复检测、首次刷新、失败后更换地址；移动端可操作。
- 在线抽测 RSS、Atom、JSON Feed、博客主页、单篇文章、pod.link/Apple、YouTube、B站UP、GitHub releases、音乐链接和无效协议；记录时间、耗时、结果与限制，不承诺一次成功等于长期稳定。
- 本机服务使用 8900–8999 / 9450–9459，预览仅绑定 127.0.0.1。没有实际 RSSHub 实例/凭据的项目只验证转换与错误路径，不标为在线通过。

### 风险

- 任意网页不能普遍转成可靠 RSS，需平台路由和结构适配；公共 RSSHub 实例可被限流。
- 现有 aggregate 的全局读取 deadline 不在此轮重构；解析器共享同一请求预算，限制候选数量和体积。
- shelf-directory 当前 .gitignore 有已暂存的用户改动，保留且不提交。
- 不推送、部署或合并 master；完成后提交分支供用户预览。

## 3. 进度

- 已检查两仓库状态、现有 discover/update 协议与订阅添加入口。
- 待用户确认此具体规划后开始开发。

## 4. 合并记录

待用户要求合并。
