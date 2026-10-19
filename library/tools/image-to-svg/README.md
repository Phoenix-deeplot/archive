# 图片转高保真 SVG（本地 Demo）

一个可实际运行的 PNG / JPG → 原生 SVG 闭环 Demo。它适合少量颜色的 Logo、图标、透明底素材和部分简单渐变；所有描摹、候选比较与下载均在本机浏览器内完成，不会上传图像，也不使用生成式生图模型。

页面中的“智能图层分析 / 修正策略”是**可解释的本地启发式分析**，而不是云端视觉模型或生成式 AI：它只从当前原图的 Alpha、颜色桶、连通区域、孔洞、边缘和细长区域提取证据，用来决定要比较哪些确定性 SVG 候选。无论某个候选来自哪条策略，只有把它栅格化回原始尺寸后通过同一套像素指标比较，才可能被选中。

## 启动

要求：Node.js 20+（用于自带的零依赖静态服务器）。无需 `npm install`。

```powershell
cd E:\Ztree\my-archive\library\tools\image-to-svg
npm start
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。

也可在仓库根目录运行现有站点服务：

```powershell
cd E:\Ztree\my-archive
python serve.py
```

然后访问 `http://127.0.0.1:8000/library/tools/image-to-svg/`。

## 实际流程

1. 浏览器将上传的 PNG/JPG 解码为原始尺寸的 RGBA `ImageData`；该原图始终是唯一验收参考。
2. 仅在用于描摹的副本中，将 `alpha=0` 的隐藏 RGB 清零，避免透明区域的隐藏色制造无意义路径；原图本身不会被改写。
3. 先执行本地图层意图分析：统计可靠前景色、透明度、主体连通区域与孔洞；当区域足够细长且宽度稳定时，将其作为可选的原生 `stroke` 候选，否则仍保留为填充轮廓。这个判断不会凭空补线、补图层或重画原图。
4. 使用有限的 ImageTracerJS 参数组合生成通用路径候选；对少色透明图，额外尝试按前景色层提取的共享边界 / 亚像素轮廓候选。对于边缘连续、全不透明且颜色桶过多的 Logo，会额外尝试将稳定底色保留为原生 `<rect>`、只描摹前景的候选，避免轻微背景色差被拆成大量小 path。默认最多 7 个、最多 8 秒，绝不会无限迭代。可调参数包括颜色数量、轮廓拟合误差、曲线平滑程度和路径简化。
5. 若原图满足“近二值透明度 + 单主体 + 低残差”的严格条件，额外尝试一维线性或中心径向 `<linearGradient>` / `<radialGradient>`。梯度候选与普通色块候选一起验收；未命中时明确保留近似色块。
6. 每个候选 SVG 都先通过结构白名单审计；路径超过 8,000 的候选会被记录并跳过，而不会中断其他有限候选。只有已通过审计的候选才会由**同一份 SVG 字符串**转为 Blob、加载到透明 Canvas，并栅格化成与原图完全相同尺寸的 PNG。
7. 浏览器先比较白底、深底和 Alpha 的最低 SSIM，再以拓扑差异、边界 Alpha 误差、内部颜色误差和轮廓 F1 作次级裁决；分数仍接近时才偏向路径较少、文件较小的版本。预览、差异图和下载都复用最终同一份 SVG 字符串 / Blob。

## 相似度定义（可复现）

- ROI：原图或 SVG 渲染结果的 `alpha > 8` 的边界并集，四周增加 2 px；这样透明大背景不会抬高分数。
- 合成：分别合成到白色 `#fff` 和深色 `#1b1f2a`，每通道采用 `out = rgb × alpha / 255 + background × (1 - alpha / 255)`。因此透明像素的隐藏 RGB 不影响分数。
- SSIM：RGB（三通道平均）和 Alpha（单通道）各自采用 11 × 11 Gaussian 局部窗口，`σ=1.5`、`L=255`、`C1=(0.01L)^2`、`C2=(0.03L)^2`。为限制耗时，ROI 很大时按 `ceil(sqrt(ROI面积 / 20000))` 的固定步长取窗口中心；渲染仍是原始全尺寸。
- 通过：白底、深底、Alpha 三个 SSIM 都不低于 `0.9900` 时，界面只显示“达到本 Demo 的图像相似度目标”。它**不**宣称所有设计细节已恢复 99%。否则会显示真实分数、差异图和“近似矢量版”，仍允许下载。
- 轮廓：另外显示 1 px 容差的轮廓 F1、原图独有（红）/ SVG 独有（青）的边缘和透明度/像素差异热图。

## 输出安全与格式

导出前在浏览器中实行元素白名单，并拒绝：`image`、`foreignObject`、`script`、`iframe`、`use`、`text`、滤镜、`data:` / base64、外链 URL 和事件属性；单个候选超过 8,000 条 path 也会被拒绝。当前输出以 `<path>` 为主；经稳定性检查的细线可以使用原生 `stroke`，简单渐变候选会额外使用 `<defs>`、`<linearGradient>` / `<radialGradient>` 和 `<stop>`，全不透明稳定底色可使用一个原生 `<rect>`；不使用位图、外链、`foreignObject` 或像素小方块模拟原图。

SVG 会被规范为原图 `width`、`height` 和 `viewBox="0 0 W H"`，因此保留宽高比例。点击下载时使用已评分的同一个 `Blob`，而不是重新生成文件。

对已保存的 SVG 可以再次运行离线审计：

```powershell
node scripts/verify-export.js .\my-output.svg
```

脚本会返回路径数、梯度数、`viewBox` 是否存在，并以非零退出码拒绝位图/外链/`data:` 等禁止内容。

## 依赖与许可证

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| [ImageTracerJS 1.2.6](https://github.com/jankovicsandras/imagetracerjs) | RGBA 颜色量化、轮廓追踪、二次贝塞尔 path 输出 | Unlicense / public domain；源码已固定在 `static/imagetracer_v1.2.6.js`，全文见 `THIRD_PARTY_LICENSES.md` |
| `static/vector-geometry.js` | 本地 Alpha 等值轮廓、连通区域 / 孔洞分析、路径平滑与细线候选辅助 | 本项目新增的无依赖源码；不是额外第三方库 |
| 浏览器 Canvas / Blob API | SVG 栅格化、PNG 验收、SSIM、差异图和下载 | 浏览器原生 API |
| Node.js | 本地静态服务器 | 本项目不依赖任何 npm 包 |
| Pillow（仅测试夹具） | 生成确定性 PNG 验证样例 | HPND；开发环境已有，非运行时依赖 |

没有使用任何生成式图像模型、云端视觉 / 语言模型、OCR、字体匹配或图像上传 API。若后续接入真正的本地模型，只能作为候选策略建议器；它不能替代原图像素验收、不能生成新设计细节，也不能绕过原生 SVG 结构审计。

## 支持范围和限制

最适合：简单 Logo、少色图标、透明背景、镂空、短细线和近似一维 / 中心径向的简单渐变。

当前不会准确恢复：照片、复杂光影、多层半透明叠加、模糊/滤镜、网格渐变、噪声纹理、复杂相邻透明色块，以及可以编辑的原始文字语义。文字会作为轮廓路径保留，不猜测字体或重排。

ImageTracerJS 的顺序叠层会尽力避免细缝；少色透明图会额外比较按前景色层提取的轮廓，以减少相邻区域各自描摹造成的边界错位。但这仍不是完整的布尔拓扑重建器，复杂邻接区域仍可能出现轮廓差异。只有细长区域满足长度、宽度和稳定性阈值时才尝试 `stroke`；不满足时保持填充轮廓，绝不把不确定形状强行解释成线条。

## 验证样例

夹具在 `test-fixtures/`，由 `scripts/generate_fixtures.py` 生成：

```powershell
npm run fixtures
```

可选的浏览器回归会驱动真实页面上传、转换、下载，并校验质量下限、页面/下载 SVG 一致性、结构审计、图层面板、差异画布和背景/缩放/叠加控件。Demo 本身无需 Playwright；仅运行这项回归时才需要它。

```powershell
$env:PLAYWRIGHT_PACKAGE_PATH = 'C:\path\to\node_modules\playwright'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run browser-validate
```

| 文件 | 验证内容 | 当前真实 Chrome 回归（2026-10-19） |
| --- | --- | --- |
| `01-transparent-solid-logo.png` | 透明底、少色纯色图形 | 白 `0.9961` / 深 `0.9976` / Alpha `0.9939` / F1 `1.0000`；1.56 s，4 path，5.9 KB。达到本 Demo 的图像相似度目标。 |
| `02-thin-line-knockout-icon.png` | 3 px 细线、透明镂空孔洞 | 白 `0.9765` / 深 `0.9900` / Alpha `0.9594` / F1 `0.9987`；0.84 s，4 path（其中 2 条 native stroke），17.4 KB。近似矢量版：抗锯齿 Alpha 仍低于阈值。 |
| `03-transparent-gradient-shape.png` | 透明底、简单对角线渐变 | 白 `0.9926` / 深 `0.9948` / Alpha `0.9983` / F1 `1.0000`；1.02 s，1 path + 1 linearGradient，3.0 KB。达到本 Demo 的图像相似度目标。 |
| `04-opaque-logo.jpg` | JPG 接收冒烟 | 白 `0.9903` / 深 `0.9588` / Alpha `0.9093` / F1 `0.9903`；1.99 s，150 path，23.1 KB。近似矢量版：JPEG 的不透明背景 / 压缩边缘不适合作为透明图形精度基准。 |

本轮使用 Chrome `155.0.8059.39` 的真实页面。四例的下载内容均与页面最终 SVG 指纹一致；`image`、`foreignObject`、`data URI`、外链 URL、事件属性和审计错误均为 `0`，页面错误和外域请求也均为 `0`。完整记录和改进前基线见 [docs/VALIDATION.md](docs/VALIDATION.md)。
