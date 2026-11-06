# 订阅添加升级（2026-11-06）

状态：用户已确认，功能实现并可本机预览；待用户验收后合并。

## 1. 任务清单（用户）

- [x] 用户粘贴不同平台、API 和协议链接，识别是否可以持续订阅。
- [x] 优先查找原生 RSS / Atom / JSON Feed；平台适配后再尝试配置的 RSSHub。
- [x] 测试实际可读性，显示已验证支持、条件支持和暂不支持的范围。
- [x] 不把单篇收录、站内播放和持续订阅混为一谈。
- [x] 对可映射到 RSSHub 但可能要求登录配置的作者/合集链接，提示前置条件；不要求用户粘贴 Cookie。
- [x] 提供“希望未来支持官方授权登录”的自愿反馈入口；不在本轮接入账号 OAuth，也不静默收集否定选择。

## 2. 规划

### 分工及文件边界

本轮由 Codex 负责实现，Claude 不分配新任务。两个仓库分别使用 codex/subscription-discovery 分支和独立 managed worktree。

| 仓库 | 可修改文件 | 不许碰 |
|---|---|---|
| my-archive | index.html 的订阅添加/匿名反馈入口；devtools/e2e/ 下订阅添加测试与隔离预览服务；忽略本轮本机预览构建目录；本规划及订阅支持说明 | 翻译词典超长行、音乐播放、阅读器、推荐算法、通用埋点、未跟踪用户文件 |
| shelf-directory | 新建 feedresolver.py；feedapi.py；tests/test_feedresolver.py；必要的 tests/test_feedapi.py；.env.example；本仓库对应规划 | aggregate.py 的公共采集行为、运营数据库、音乐 API、路由入口数量、密钥和部署配置 |

### 功能边界

1. 规范化 feed://、webcal://、itpc://、podcast:// 中带有真实 Feed 地址的链接；rsshub:// 仅映射到管理员配置的 RSSHUB_BASE。其他应用私有协议只做明确识别，不猜测 URL。
2. 原生 RSS、Atom、JSON Feed 和网页 alternate feed 保持兼容；补文章页的显式订阅发现，订阅前显示来源范围及近期条目，避免用户误以为只订阅当前文章。
3. pod.link 和 Apple Podcasts 节目页优先根据节目 ID 经 Apple lookup 获取 feedUrl，再验证真实 Feed；不把单集地址当节目订阅。尽力从 pod.link 页面显式链接发现 RSS。
4. GitHub 仓库提供 releases.atom / commits 对应的明确更新类型，不把整个源码仓库当文章 RSS。
5. 保留 YouTube 原生频道/播放列表订阅；补 @handle 的显式 channel ID / feed 发现，单视频仍为单篇收录。
6. RSSHub 平台适配只纳入可从分享链接稳定提取 ID 的作者/合集路由：B 站 UP、X 用户、知乎用户动态/收藏夹、小红书用户笔记。RSSHUB_BASE 由站长提供，候选通过普通 Feed 验证后才允许订阅；不支持任意路由拼接。
7. 上述社交平台路由可能要求 RSSHub 实例的 Cookie、平台会话或浏览器能力。失败时明确指出“需要站长实例配置/平台权限”，提示用户暂时可仅收录原链接，并询问是否期待未来的官方跳转授权。用户不得在知树粘贴 Cookie、密码或访问令牌；本轮不实现 OAuth。
8. 任意 JSON API 不自动假设字段结构；标准 JSON Feed 可用，私有 API 提示需要专用适配器。音乐歌单/单曲不假装成持续订阅或获得播放授权。
9. 失败时区分登录/访问限制、找不到订阅、源失效、协议不支持、RSSHub 未配置；允许安全 HTTP(S) 链接仅收录，补充帮助操作。

### 接口约定

继续使用 POST /api/feed：{action: discover, url: string}，保留 kind=feed/link 和现有字段。
可选新增 resolution（原始链接、识别的平台、解析方式、订阅范围）、suggestions（已发现候选源或下一步操作）、诊断 reason。候选地址全部由服务端重新验证；不接受用户指定任意请求头、Cookie 或密钥。
feedapi.handle 将 env 传入 discover；直接调用 discover(raw) 保持可用。
更新继续使用原 /api/feed action=update；解析后的真实源保存到 c.feed.url，沿用现有刷新、去重与本地缓存。

### 验收

- 隔离测试覆盖协议、链接形状、平台识别、Feed 验证、失败分类、超时、SSRF 和候选注入。
- 回归 tests.test_feedapi、tests.test_aggregate、tests.test_api_router；前端语法与重名函数检查。
- 页面验证：粘贴、查找、查看结果、确认订阅、重复检测、首次刷新、失败后更换地址；移动端可操作。
- 页面验证：X/知乎/小红书需要实例权限时出现可收起的登录授权意愿提示；确认后转到现有反馈框并预填需求，用户主动发送后在 shelf-directory 运营反馈里标为 `sub-auth`；“暂时不需要”只在当前结果中收起。
- 在线抽测 RSS、Atom、JSON Feed、博客主页、单篇文章、pod.link/Apple、YouTube、B站UP、GitHub releases、音乐链接和无效协议；记录时间、耗时、结果与限制，不承诺一次成功等于长期稳定。
- 本机服务使用 8900–8999 / 9450–9459，预览仅绑定 127.0.0.1。没有实际 RSSHub 实例/凭据的项目只验证转换与错误路径，不标为在线通过。

### 风险

- 任意网页不能普遍转成可靠 RSS，需平台路由和结构适配；公共 RSSHub 实例可被限流。
- 现有 aggregate 的全局读取 deadline 不在此轮重构；解析器共享同一请求预算，限制候选数量和体积。
- shelf-directory 当前 .gitignore 有已暂存的用户改动，保留且不提交。
- 不推送、部署或合并 master；完成后提交分支供用户预览。

## 3. 进度

- 已检查两仓库状态、现有 discover/update 协议与订阅添加入口。
- 用户确认“按此范围开始开发”后建立两个独立 worktree，均使用 codex/subscription-discovery 分支。
- 前端：C:/Users/Wu/.codex/worktrees/subscription-discovery/my-archive。
- 后端：E:/Ztree/wt/codex-subscription-discovery-api（managed 工具无法识别后端仓库，改用 Git worktree）。
- 添加类型/范围说明、简化移动端文案、协议错误和仅收录选项；请求版本号防止旧响应覆盖新输入。
- 后端 156 项回归通过；补充安全与 JSON API 用例后，解析器和 Feed API 的 52 项检查通过。
- 移动端真实端到端 8 项通过：节目解析、范围、确认订阅、首次更新、重复检测、RSSHub 缺失、未知协议、旧请求防覆盖。JS 语法与重名检查通过。授权意愿交互已补进浏览器测试，但当前机器的无头浏览器未能启动，尚未重跑这组扩展测试。
- 本机预览：http://127.0.0.1:8939/?lang=zh 。点击“添加 → 订阅”；这是使用示例资料的隔离预览，通过新后端读取公开订阅源。预览服务会把 `manifest.js` 与 `manifest.json` 的目录地址改为当前端口；否则示例清单中的默认 8820 会导致 `Failed to fetch`，公共目录及依赖 `feed_api` 的订阅页签都不会出现。页面目录数据已在浏览器实测加载，反馈收件箱只保存在本机进程内存。
- 新增平台识别：YouTube 播放列表、X 作者、知乎用户动态/收藏夹、小红书用户笔记，全部只在 RSSHUB_BASE 配置可用后尝试。X/知乎/小红书路由增加实例权限说明；不收集登录凭据。用户点“希望支持授权”会打开现有反馈框，点“暂时不需要”仅收起当前提示。

### 2026-11-06 在线抽测（本机网络；非可用性承诺）

| 输入 | 结果 | 耗时 |
|---|---|---|
| https://pod.link/1714394532 | 旧接口 HTTP 429；新接口经 Apple 找到《鲶鱼夜话》，验证喜马拉雅 RSS，返回近期 50 条；直接解析原 Feed 共 304 期 | 新接口约 1.2 秒 |
| https://podcasts.apple.com/cn/podcast/a/id1714394532 | 解析为同一节目 RSS | 1.12 秒 |
| feed://www.ximalaya.com/album/66572833.xml | 协议转换后解析成功 | 0.70 秒 |
| https://www.ruanyifeng.com/blog/atom.xml | Atom 成功，3 条 | 1.59 秒 |
| https://www.jsonfeed.org/feed.json | JSON Feed 成功，2 条 | 1.62 秒 |
| https://github.com/DIYgod/RSSHub | releases.atom 成功，10 条 | 2.73 秒 |
| https://space.bilibili.com/2267573 | 正确识别需 RSSHUB_BASE；未有实例，不能标记在线成功 | 即时提示 |
| spotify:show:123 | 提示复制网页分享链接，不误报可订阅 | 即时提示 |
| YouTube 官方示例频道 ID | 此网络返回 404，未通过在线测试；原生转换及 handle ID 提取有隔离测试 | 0.67 秒 |
| YouTube @GoogleDevelopers | 此网络读取超时，不能承诺在线可用。前端 28 秒超时保护仍在；底层安全抓取的 DNS/连接总耗时问题留在现有网络层 | 41.78 秒 |

### 支持和限制

- 原生 RSS/Atom/JSON Feed；显式 alternate 声明的网页；Apple 数字节目 ID 的 pod.link；Apple 节目页；GitHub 仓库版本更新；Feed 类协议可用。
- B站 UP 与 rsshub:// 需要配置自己的 RSSHub HTTPS 实例。已核实官方路由 /bilibili/user/video/:uid，路由依赖浏览器环境，实例能力和上游风控可能导致失败；只验证成功后才可订阅。
- 任意 JSON API 需专用字段适配；X/知乎/小红书需对应可用路由及实例权限；音乐分享不等于更新订阅。均有明确提示，可用安全网页链接仅收录。
- 本轮不自动搜索全网替代源，也不代理用户登录；准确匹配的播客目录查询已实现。音乐播放与推荐不改。

## 4. 合并记录

待用户要求合并。
