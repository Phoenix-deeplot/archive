---
title: 收藏库使用说明
description: 怎么往收藏库里加内容、怎么隐藏和恢复，以及 HTML、Markdown、TXT、PDF 各自的显示方式。
tags: [使用说明, archive, markdown]
pinned: true
---
# 个人数字图书馆 · My Archive

一个放笔记与收藏的个人网页：自动读取 `library/` 里的 HTML、Markdown、TXT 和 PDF，生成带封面的卡片，左侧是分类和卡片目录，支持中英文界面、关键词筛选、隐藏与恢复，以及站内阅读。

```
my-archive/
├── index.html         收藏首页（打开它）
├── serve.py           本地服务：实时扫描 library/，“添加”按钮可直接写入文件夹
├── build_index.py     生成 manifest.json / manifest.js（静态部署或直接双击打开时用）
├── manifest.json      卡片清单（自动生成）
├── manifest.js        同上，供 file:// 直接打开时读取
├── vendor/            Markdown 渲染（marked）与安全过滤（DOMPurify），已内置，离线可用
└── library/
    ├── books/         书籍
    ├── tools/         工具
    ├── notes/         个人笔记
    ├── featured/      精选
    └── _meta.json     网页里的星标、隐藏、标题和摘要修改（自动维护）
```

## 三种用法

**1. 本地服务（推荐）**

```bash
cd my-archive
python3 serve.py          # 自动打开 http://127.0.0.1:8000
```

- 往 `library/<分类>/` 放一个 HTML、Markdown、TXT 或 PDF，回到页面刷新，卡片就出现。
- 点右上角 **添加**（或把文件拖进页面），文件会直接写入对应的分类文件夹。
- 星标“精选”和“隐藏”保存在 `library/_meta.json`，换浏览器也在。
- 只需要 Python 3，不用装任何依赖。服务默认只监听本机；它能写文件，不要暴露到公网。

**2. 直接双击 `index.html`**

- 页面读取 `manifest.js`。新增文件后运行一次 `python3 build_index.py` 再刷新。
- 或者在 Chrome / Edge 里点左下角 **连接文件夹**，选 `library`（或项目根目录）。之后放文件刷新即见，“添加”也会写进文件夹。下次打开时点 **重新连接文件夹** 授权即可。
- 不连接文件夹时，“添加”的文件只保存在当前浏览器里（IndexedDB），卡片上会有删除按钮。

**3. 部署成静态网站（GitHub Pages、Vercel、Netlify 等）**

- 上传前运行 `python3 build_index.py`，把 `manifest.json`、`manifest.js` 和 `library/` 一起上传。
- 静态站点上，访问者点“添加”或星标只影响他自己的浏览器。

## 支持的格式

| 格式 | 标题 | 摘要 | 阅读方式 |
| --- | --- | --- | --- |
| HTML | `<title>` | description 或导语段落 | 保留原网页的设计 |
| Markdown（.md） | front matter 或第一个 `#` 标题 | front matter 或第一段 | 统一的阅读排版，三个以上小标题时自动生成目录 |
| TXT | 第一行 | 后面的文字 | 统一的阅读排版 |
| PDF | 文档属性里的标题，否则用文件名 | 需要手动填写（添加时可填） | 浏览器自带的 PDF 阅读器；手机上显示“打开 PDF”按钮 |

- 首页只读取每个文件的标题、摘要等元数据，不会把整份文件加载进来，文件多、文件大也不会拖慢首页。
- 单个文件上限：运行 `serve.py` 时 80 MB；只保存在浏览器里时 30 MB。
- Word（.docx）暂不支持：浏览器端转换需要额外约 600 KB 的库，排版还原也不稳定。建议另存为 PDF 或 Markdown 再放进来。

## 隐藏与恢复

- 卡片上的“隐藏”不会删除文件，只是让它不再出现在分类、目录和搜索里；隐藏后几秒内可以点“撤销”。
- 左侧最下方的 **已隐藏** 里可以随时恢复。
- 只保存在浏览器里的内容，在“已隐藏”里额外有“彻底删除”，用来释放浏览器空间。

## 分类规则

- `library/` 下的一级文件夹就是分类：`books`／`书籍`、`tools`／`工具`、`notes`／`个人笔记`、`featured`／`精选`。
- 新建其他文件夹（例如 `library/papers/`），会自动成为新分类。
- **精选** = `featured/` 文件夹里的内容 + 任何打了星标的卡片。

## 标题和摘要从哪里来

- 标题：`<title>`，没有时用第一个 `<h1>`，再没有用文件名。
- 摘要：`<meta name="description">` → `class="lead"` 的段落 → 正文第一段较长的文字。
- 可选的 meta 标签（写在 HTML 的 `<head>` 里）：

```html
<meta name="description" content="一句话摘要">
<meta name="keywords" content="供应链, procurement">
<meta name="archive:category" content="books">      <!-- 文件放在 library/ 根目录时生效 -->
<meta name="archive:featured" content="true">
<meta name="archive:cover" content="cover.jpg">     <!-- 不写就自动生成封面 -->
<meta name="archive:date" content="2026-10-13">
```

- Markdown 可以在开头写 front matter：

```markdown
---
title: 我的标题
description: 一句话摘要
tags: [供应链, 读书]
featured: true
---
```

- 用“添加”导入时，可以先改标题和摘要再保存。

## 阅读与快捷键

- 点卡片在站内阅读。顶栏中间是上一篇、下一篇和位置（如 3 / 12），右侧是“设为精选”和“新标签打开”；会记住阅读进度，首页显示“继续阅读”。
- `/` 聚焦搜索；`Esc` 关闭阅读或清空搜索；阅读时 `←` `→` 切换上一篇、下一篇。
- 搜索支持中英文，多个关键词用空格分开（同时满足）。

## 说明

- 封面根据文件名生成，同一篇每次一样；点卡片上的“换一张封面”可以换。
- 阅读进度、封面选择、界面语言和主题保存在浏览器的 localStorage 里。
- 标题字体从 Google Fonts 加载，离线时自动使用系统字体。
- HTML 最好是自包含的（CSS、JS、图片都内联）。用“连接文件夹”或浏览器本地保存打开时，文件里的相对路径资源可能加载不到。
- 通过 `file://` 直接打开时，浏览器不允许读取 iframe 内容，阅读进度不会记录；用 `serve.py` 时一切正常。

---

**English, in short.** Run `python3 serve.py`, drop `.html`, `.md`, `.txt` or `.pdf` files into `library/books|tools|notes|featured/`, refresh. Hide moves a card to **Hidden**, where it can be restored. The **Add** button writes files into the folder. For static hosting, run `python3 build_index.py` first and upload everything. Switch the interface language at the bottom left.
