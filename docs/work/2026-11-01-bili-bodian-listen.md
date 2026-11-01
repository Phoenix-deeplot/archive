# Bilibili 与波点音乐接入（2026-11-01）

状态：规划中

## 1. 任务清单（用户）

- [ ] 接入 Bilibili 音乐 API 和波点音乐 API。
- [ ] 在“今日听什么”增加热门歌曲、热门歌手歌曲、推荐歌单内容。
- [ ] 尽量让内容在站内播放。

## 2. 规划（Codex）

### 分工

| 任务 | 负责 | 分支 / worktree | 会改的文件 | 不许碰 |
|---|---|---|---|---|
| 在公共目录服务端扩展 `/api/listen` 的来源适配、榜单组装与测试 | Codex | `codex/listen-bili-bodian` · `E:\Ztree\wt\codex-listen-bili-bodian` | `E:\Ztree\shelf-directory\listen.py`、`tests/test_listen.py`、该仓库 `README.md` | 其他来源行为、密钥、线上环境变量 |
| 核对前端兼容性；仅当接口字段不足时更新“今日听什么” | Codex | 同上 | `index.html`（仅必要的播放器兼容） | 书架、公共目录其他版面、广告布局 |

### 接口约定

- 保持 `GET /api/listen[?lang=zh|en]` 和 `GET /api/listen?g=<group-id>&lang=zh|en` 的既有结构，不增加前端直连第三方 API。
- 榜单组沿用 `groups[]` 的 `id/name/name_en/kind/type/net`；歌曲沿用 `id/title/artist/cover/dur/mode/audio/url/from`。
- Bilibili 搜索结果只使用经校验的 BV 号和官方站内播放器 URL（`mode=embed`）；不使用第三方接口返回的 `audio_download_url` / `.m4s` 音频代理地址。
- 波点搜索结果仅在确认其播放地址允许面向公众、含广告的网站站内播放后，才可作为 `mode=stream` 接入；否则只保留可用的元数据与原站链接，不伪装成可站内播放。
- 两个接口当前文档只列出按歌曲名/歌手检索和单曲解析，未列出热门榜单或歌单 API。热门歌曲的种子优先取现有榜单；热门歌手从热榜去重整理；推荐歌单先由现有可用榜单/歌单组合，或使用人工维护的歌手种子，不声称是第三方平台原生歌单。
- Bilibili API token 通过服务端环境变量 `LISTEN_BILIBILI_TOKEN` 提供；不进仓库、不返回给浏览器、不写入诊断日志。波点 API 如后续需要认证，使用服务端环境变量，不在 URL、日志或响应中暴露密钥。

### 验收

- `/api/listen` 返回新增中文/英文分组；热门歌曲、歌手内容和推荐歌单有稳定、去重后的条目。
- `/api/listen?g=<group-id>` 只返回符合现有前端数据格式的条目；Bilibili BV 号只能打开官方播放器；未授权的第三方音频 URL 不进入站内音频播放器。
- 未配置 Bilibili token、接口超时、格式变更、限流或零结果时，旧榜单仍正常返回，诊断仅显示不含密钥的状态原因。
- 用固定响应 fixture 覆盖成功、空结果、坏 URL、坏 BV 号、超时及密钥隐藏；运行 `python -X utf8 -m unittest tests.test_listen`。
- 前端已有 `stream` / `embed` 播放兼容；如不需要改 `index.html`，保持不改。

### 端口

- Codex：8900–8999、9450–9459（如需本地预览）。

### 风险和要避开的冲突点

- API 文档没有证明两家解析服务获得了面向公开网站、广告场景的音乐播放授权；Bilibili 的第三方音频代理尤其不作为正式播放源。
- 波点文档称支持会员歌曲，但没有列出授权范围、配额、SLA 或播放 URL 有效期；正式启用直播放前需确认这些条款。
- 当前工作区允许写 `my-archive`，但 `shelf-directory` 是另一仓库且不在当前可写目录内；获准后需按该仓库流程建立分支/worktree，不能直接改其 master。
- 用户已有的未跟踪文件和其他 AI 的工作均不触碰；不推送、不部署、不修改 Vercel 环境变量。

## 3. 进度

### Codex

- 已核对：现有“今日听什么”前端支持 `stream` 和官方播放器 `embed`；公共目录后端已具有榜单/歌单来源、缓存、诊断和测试框架。
- 已核对：用户提供的两个 API 文档只列出单曲/歌手检索或解析，没有热门榜单/歌单接口。
- 等待用户确认规划，以及波点 `play_url` 是否有面向公开广告网站站内播放的授权；确认前不改服务端代码。

## 4. 合并记录

- 合并顺序：尚未开发。
- 合并后的测试结果：尚未运行。
- 删除的分支和 worktree：无。
