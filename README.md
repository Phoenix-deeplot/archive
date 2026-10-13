# 我的收藏 · My Archive

一个放笔记与收藏的个人网页：自动读取 `library/` 里的 HTML、Markdown、TXT 和 PDF，生成带封面的卡片，左侧是分类和卡片目录，支持中英文界面、搜索、星标、隐藏与站内阅读。

## 用法

```bash
python serve.py        # Mac / Linux 用 python3 serve.py
```

浏览器会自动打开 http://127.0.0.1:8000 。就这一条命令：

- **实时扫描 `library/`**：往 `library/books|tools|notes|featured/` 里放文件，刷新页面就出现。
- **添加**：点右上角“添加”，或把文件 / 文件夹拖进页面，直接写入 `library/`。
- **移动分类**：卡片上的文件夹图标，选一个分类（书籍、工具、个人笔记……），文件（工具则是整个文件夹）会真的移到对应的 `library/<分类>/` 里，标题、星标、阅读进度跟着走。重名时自动加 `-2`。
- **彻底删除**：先点“隐藏”，在左侧“已隐藏”里点“彻底删除”，确认后文件（工具则是整个文件夹）从 `library/` 里删掉，**无法恢复**。只有已隐藏的卡片才能删，避免误删。
- 移动和删除作用于 `serve.py` 的 `library/`（以及访问者在浏览器里添加的文件）；服务器的列表在部署的站点上是只读的，没有这两个按钮。
- **星标、隐藏、改标题** 保存在 `library/_meta.json`。
- `manifest.json` / `manifest.js` **自动保持最新**（启动时、每次刷新页面、`library/` 里有任何变化时），不需要手动运行 `build_index.py`。
- 只需要 Python 3，不用装依赖。服务只接受发往本机的请求；它能写文件，不要暴露到公网。
- 改了 `serve.py` 之后要重启它，否则运行中的还是旧代码。

## 目录

```
my-archive/
├── index.html        网页
├── serve.py          本地服务（默认用法）
├── build_index.py    扫描 library/ 生成清单；serve.py 内部也用它，单独运行只在不开 serve.py 时才需要
├── manifest.json     卡片清单（自动生成）
├── manifest.js       同上，双击打开 index.html 时读取
├── vercel.json       Vercel 部署时自动扫描一遍 library/
├── vendor/           Markdown 渲染（marked）与安全过滤（DOMPurify），离线可用
└── library/
    ├── books/  tools/  notes/  featured/    一级文件夹就是分类，新建别的文件夹会成为新分类
    └── _meta.json
```

## 工具 = 文件夹

一个网页工具由多个文件组成（`index.html` + css + js + 图片）时，放进 `library/tools/<工具名>/`：

- **文件夹里有 `index.html`，整个文件夹就是一张卡片**（右上角有 **APP** 标记），里面的 css / js / 图片不会各自成卡。
- 添加：点“添加 → 选择项目文件夹”，或把文件夹拖进页面。`.git`、`node_modules`、以 `.` 开头的文件会自动跳过。
- 工具里的资源请用相对路径（`styles.css`、`js/game.js`），不要用 `/` 开头的绝对路径。
- 直接放在分类里的 `library/tools/index.html` 仍是普通的单文件卡片；没有 `index.html` 的文件夹只是普通文件夹，里面的文件各自成卡。

## 本地预览用 `serve.py`，不要用 `vercel dev`

`vercel dev` **启动时就记住了当时有哪些文件**：之后在 `serve.py` 里新增、移动的文件，它读到的清单里有、但文件本身会 404（已存在的文件被修改倒是能看到）。所以：

- 日常本地预览、管理都用 `python serve.py`，它是实时的。
- 非要看静态站点的效果，先停掉再重新运行 `vercel dev`。
- 在静态页面（`vercel dev`、线上）上点过“星标 / 隐藏”会记在那个浏览器里，并覆盖清单里的值；想清掉就清除该站点的浏览器数据。

## 部署到 Vercel

Vercel 是静态 / 无服务器平台，**不能运行 `serve.py`**（没有常驻进程，磁盘只读，也不能写文件）。部署时它会按 `vercel.json` 先自动扫描一遍 `library/` 生成清单，所以：

```bash
vercel --prod
```

- 部署出来的站点上，服务器的列表**始终照常显示**，对所有访问者只读：不能往服务器里添加、移动、删除，访问者的星标 / 隐藏只保存在他自己的浏览器里。访问者自己的本地使用见下一节。
- 新文件必须重新部署才会出现（静态站点没有后台）。
- 看不到新内容时，打开 `https://你的域名/manifest.json` 看 `generated` 和 `items`：不在清单里 = 部署的不是最新文件；在清单里却不显示 = 在这个浏览器里点过“隐藏”（去“已隐藏”恢复）。
- `.gitignore` 里不要忽略 `vercel.json`。

## 访问者的本地使用（部署的站点上，或不开 `serve.py` 时）

页面上显示的是三份内容**并排**，互不替换：服务器自己的列表、访问者自己连接的本机文件夹、访问者在浏览器里添加的文件。后两份卡片上会标出“本机文件夹”“仅此浏览器”，**只存在访问者自己的电脑上，不会上传到服务器，别人也看不到**。

- **连接文件夹**（Chrome / Edge，左下角）：选自己电脑上的一个文件夹（选 `library` 或包含 `books/ tools/ notes/` 的目录），里面的文件就和服务器的列表一起显示。连接后“添加”写进这个文件夹，星标 / 隐藏写进它的 `_meta.json`。“更换本机文件夹”“断开”在同一处。
- **添加单个文件**：没连接文件夹时，“添加”把文件存在这个浏览器里（上限 30 MB 一个）；换浏览器或清除浏览器数据会丢失。这些文件可以改分类，也可以隐藏后彻底删除。
- 用 `serve.py` 时不显示“连接文件夹”：那时 `library/` 本来就是你自己的文件夹，“添加”直接写进去。
- 限制：本机文件夹和浏览器里的内容读不到工具（多文件网页）的 css / js，也不能添加项目文件夹，这需要 `serve.py`。双击打开 `index.html` 时，没连接文件夹就读不了 Markdown / TXT（浏览器限制）。

## 支持的格式

| 格式 | 标题 | 摘要 | 阅读方式 |
| --- | --- | --- | --- |
| HTML | `<title>` | description 或导语段落 | 保留原网页的设计 |
| Markdown | front matter 或第一个 `#` 标题 | front matter 或第一段 | 统一排版，三个以上小标题时自动生成目录 |
| TXT | 第一行 | 后面的文字 | 统一排版 |
| PDF | 文档属性里的标题，否则文件名 | 添加时手动填 | 浏览器自带的 PDF 阅读器；手机，或浏览器把 PDF 设成“下载”时，显示“打开 / 下载”按钮 |

单个文件上限 80 MB。Word（.docx）不支持，请另存为 PDF 或 Markdown。

HTML 里可选的 meta：`description`、`keywords`、`archive:category`、`archive:featured`、`archive:cover`、`archive:date`；Markdown 开头可写 front matter（`title`、`description`、`tags`、`featured`）。

## 阅读与快捷键

点卡片在站内阅读，顶栏有上一篇 / 下一篇、“设为精选”、“新标签打开”；会记住阅读进度，首页显示“继续阅读”。`/` 聚焦搜索，`Esc` 关闭阅读，阅读时 `←` `→` 切换。卡片上的“隐藏”不删除文件，在左侧最下方的“已隐藏”里可以恢复或彻底删除。

---

**English, in short.** Run `python serve.py` and open http://127.0.0.1:8000. It scans `library/books|tools|notes|featured/` live; **Add** (files or whole folders) writes into it; a card can be moved to another category (the file really moves), and a hidden card can be deleted for good; the manifest files are kept up to date automatically. A folder with an `index.html` under `library/tools/` is one card (a multi-file web tool). Vercel cannot run `serve.py`; `vercel --prod` rebuilds the manifest on deploy (see `vercel.json`) and the deployed site's own list is read-only for everyone. Visitors can additionally “Connect folder” (their own local folder) and add single files kept in their own browser; both are shown next to the site's list, never uploaded to the server.
