/*
 * Browser-only vectorization controller.
 * The only SVG text kept in state.svgText is also the text previewed, scored and downloaded.
 */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_DIMENSION = 2048;
  // This is an export-safety limit, not a quality target. A candidate beyond
  // it is never previewed or downloaded, but must not prevent simpler
  // candidates from being evaluated.
  const MAX_PATH_COUNT = 8000;
  // Full connected-component and contour measurements are intentionally
  // bounded.  A 2048² upload can still use ImageTracer, but it must not turn
  // every candidate comparison into an unbounded multi-million-pixel BFS.
  const MAX_STRUCTURED_PIXELS = 900000;
  const VISIBLE_ALPHA = 8;
  const OPAQUE_ALPHA = 245;
  const SSIM_KERNEL = makeGaussianKernel(11, 1.5);
  const ALLOWED_TAGS = new Set([
    'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'title', 'desc'
  ]);
  const FORBIDDEN_TAGS = new Set(['image', 'foreignobject', 'script', 'iframe', 'use', 'style', 'filter', 'pattern', 'text', 'feimage']);

  const el = {
    file: $('#fileInput'),
    dropzone: $('#dropzone'),
    inputInfo: $('#inputInfo'),
    convert: $('#convertButton'),
    status: $('#statusLine'),
    results: $('#results'),
    originalPreview: $('#originalPreview'),
    originalStage: $('#originalStage'),
    svgStage: $('#svgStage'),
    overlayStage: $('#overlayStage'),
    overlayOriginal: $('#overlayOriginal'),
    overlaySvg: $('#overlaySvg'),
    overlayClip: $('#overlaySvgClip'),
    slider: $('#compareSlider'),
    sliderLine: $('#sliderLine'),
    sourceSize: $('#sourceSize'),
    svgSize: $('#svgSize'),
    verdict: $('#verdict'),
    metricGrid: $('#metricGrid'),
    metricDefinition: $('#metricDefinition'),
    auditState: $('#auditState'),
    auditList: $('#auditList'),
    limitations: $('#limitations'),
    layerPlanSummary: $('#layerPlanSummary'),
    layerPlanList: $('#layerPlanList'),
    localRefinementNote: $('#localRefinementNote'),
    diff: $('#differenceCanvas'),
    edge: $('#edgeCanvas'),
    download: $('#downloadButton'),
    downloadHint: $('#downloadHint'),
    colorCount: $('#colorCount'),
    lineError: $('#lineError'),
    curveError: $('#curveError'),
    pathOmit: $('#pathOmit'),
    candidateLimit: $('#candidateLimit'),
    timeBudget: $('#timeBudget'),
    colorCountOut: $('#colorCountOut'),
    lineErrorOut: $('#lineErrorOut'),
    curveErrorOut: $('#curveErrorOut'),
    pathOmitOut: $('#pathOmitOut')
  };

  const state = {
    file: null,
    sourceUrl: null,
    svgUrl: null,
    width: 0,
    height: 0,
    sourceData: null,
    sourceDerived: null,
    svgText: '',
    svgBlob: null,
    selected: null,
    converting: false,
    background: 'light',
    inputName: 'vectorized.svg',
    gradientNote: '未分析',
    sourcePngBlob: null,
    layerPlan: null,
    candidates: []
  };

  bindEvents();
  updateSettingOutputs();

  function bindEvents() {
    el.file.addEventListener('change', () => chooseFile(el.file.files[0]));
    el.dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.file.click();
      }
    });
    ['dragenter', 'dragover'].forEach((name) => el.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      el.dropzone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((name) => el.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      el.dropzone.classList.remove('dragging');
    }));
    el.dropzone.addEventListener('drop', (event) => chooseFile(event.dataTransfer.files[0]));
    el.convert.addEventListener('click', convert);
    [el.colorCount, el.lineError, el.curveError, el.pathOmit].forEach((input) => input.addEventListener('input', updateSettingOutputs));
    el.slider.addEventListener('input', updateComparisonSlider);
    $$('.bg-button').forEach((button) => button.addEventListener('click', () => setBackground(button.dataset.background)));
    $$('.size-button').forEach((button) => button.addEventListener('click', () => setPreviewSize(button.dataset.size)));
    el.download.addEventListener('click', downloadSvg);
  }

  function updateSettingOutputs() {
    el.colorCountOut.textContent = el.colorCount.value;
    el.lineErrorOut.textContent = Number(el.lineError.value).toFixed(2);
    el.curveErrorOut.textContent = Number(el.curveError.value).toFixed(2);
    el.pathOmitOut.textContent = `${el.pathOmit.value} px`;
  }

  async function chooseFile(file) {
    if (!file || state.converting) return;
    try {
      setStatus('正在读取原图…', 'busy');
      validateFileShape(file);
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!isSupportedSignature(signature)) throw new Error('文件不是可识别的 PNG 或 JPEG。请重新导出为标准 PNG/JPG 后再试。');
      const url = URL.createObjectURL(file);
      const image = await loadImage(url);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('浏览器无法解码该图片。请尝试重新保存为 RGB/RGBA PNG 或基线 JPEG。');
      if (Math.max(image.naturalWidth, image.naturalHeight) > MAX_DIMENSION) {
        URL.revokeObjectURL(url);
        throw new Error(`图片最长边为 ${Math.max(image.naturalWidth, image.naturalHeight)} px，超过本 Demo 的 ${MAX_DIMENSION}px 上限。请先等比例缩小后重试。`);
      }
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      state.sourceUrl = url;
      state.file = file;
      state.width = image.naturalWidth;
      state.height = image.naturalHeight;
      state.inputName = sanitizeFilename(file.name).replace(/\.[^.]+$/, '') || 'vectorized';
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = state.width;
      sourceCanvas.height = state.height;
      const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, state.width, state.height);
      ctx.drawImage(image, 0, 0);
      state.sourceData = ctx.getImageData(0, 0, state.width, state.height);
      state.sourceDerived = deriveSourceFields(state.sourceData, state.width, state.height);
      state.layerPlan = analyzeLayerPlan(state.sourceData, state.width, state.height);
      state.sourcePngBlob = await canvasToBlob(sourceCanvas, 'image/png');
      resetOutput();
      el.originalPreview.src = url;
      el.overlayOriginal.src = url;
      el.sourceSize.textContent = `${state.width} × ${state.height} px · ${formatBytes(file.size)}`;
      el.inputInfo.textContent = `${file.name} · ${state.width} × ${state.height} px · ${formatBytes(file.size)} · 原图已锁定为唯一参考。`;
      el.dropzone.classList.add('has-file');
      el.dropzone.querySelector('strong').textContent = `已选择：${file.name}`;
      el.dropzone.querySelector('span:last-child').textContent = '不会上传到服务器；点击“开始矢量化”后将在本机生成有限候选并验收。';
      el.convert.disabled = false;
      setStatus('原图已就绪。将使用自动候选参数搜索。');
    } catch (error) {
      setStatus(error.message || '读取图片失败。', 'error');
      el.convert.disabled = !state.sourceData;
    }
  }

  function validateFileShape(file) {
    if (file.size === 0) throw new Error('文件为空。请选择有效的 PNG 或 JPG。');
    if (file.size > MAX_BYTES) throw new Error(`文件为 ${formatBytes(file.size)}，超过本 Demo 的 20 MB 上限。请压缩或缩小图片。`);
    if (!/\.(png|jpe?g)$/i.test(file.name) && !['image/png', 'image/jpeg'].includes(file.type)) {
      throw new Error('仅支持 PNG、JPG / JPEG。请将图片转换为这些格式后重试。');
    }
  }

  function isSupportedSignature(bytes) {
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return png || jpeg;
  }

  async function convert() {
    if (!state.sourceData || state.converting) return;
    if (!window.ImageTracer) {
      setStatus('矢量化内核未加载。请确认 static/imagetracer_v1.2.6.js 存在，然后通过本地 HTTP 服务打开此页面。', 'error');
      return;
    }
    state.converting = true;
    el.convert.disabled = true;
    el.download.disabled = true;
    resetOutput();
    const settings = getSettings();
    const started = performance.now();
    const layerPlan = state.layerPlan || analyzeLayerPlan(state.sourceData, state.width, state.height);
    state.layerPlan = layerPlan;
    const gradientFits = analyzeSimpleGradients(state.sourceData, state.width, state.height);
    state.gradientNote = gradientFits.note;
    const contourSpecs = buildContourSpecs(layerPlan, settings, gradientFits);
    const paletteContourSpecs = buildPaletteContourSpecs(layerPlan, gradientFits);
    const foregroundMaskSpecs = buildForegroundMaskSpecs(layerPlan, settings);
    const reserveForStructuredCandidates = Math.min(
      contourSpecs.length + Math.min(1, gradientFits.fits.length) + paletteContourSpecs.length + foregroundMaskSpecs.length,
      Math.max(0, settings.candidateLimit - 1)
    );
    const basePlan = buildCandidatePlan(settings, Math.max(1, settings.candidateLimit - reserveForStructuredCandidates), layerPlan);
    const candidates = [];
    const rejectedCandidates = [];
    let timedOut = false;

    try {
      const tracingData = sanitizeTransparentPixels(state.sourceData);
      for (let index = 0; index < foregroundMaskSpecs.length && candidates.length < settings.candidateLimit; index += 1) {
        if (performance.now() - started > settings.timeBudgetMs) { timedOut = true; break; }
        const spec = foregroundMaskSpecs[index];
        setStatus(`分离稳定底色并描摹前景候选 ${index + 1} / ${foregroundMaskSpecs.length}…`, 'busy');
        await nextPaint();
        const foregroundData = maskStableBackdrop(tracingData, layerPlan.opaqueBackdrop, spec.distance);
        await tryAddCandidate(candidates, rejectedCandidates, () => makeTracedCandidate(
          foregroundData,
          spec.plan,
          spec.plan.label
        ));
      }
      for (let index = 0; index < basePlan.length; index += 1) {
        if (candidates.length >= settings.candidateLimit) break;
        if (performance.now() - started > settings.timeBudgetMs) { timedOut = true; break; }
        setStatus(`描摹候选 ${index + 1} / ${basePlan.length}${gradientFits.fits.length ? '，随后会尝试简单渐变拟合' : ''}…`, 'busy');
        await nextPaint();
        await tryAddCandidate(candidates, rejectedCandidates, () => makeTracedCandidate(
          tracingData,
          basePlan[index],
          basePlan[index].label || `色块候选 ${index + 1}`
        ));
      }
      for (let index = 0; index < paletteContourSpecs.length && candidates.length < settings.candidateLimit; index += 1) {
        if (performance.now() - started > settings.timeBudgetMs) { timedOut = true; break; }
        const paletteSpec = paletteContourSpecs[index];
        setStatus(`按前景色层拟合共享像素边界候选 ${index + 1} / ${paletteContourSpecs.length}…`, 'busy');
        await nextPaint();
        const paletteCandidate = makePaletteContourCandidate(layerPlan, settings, paletteSpec);
        if (paletteCandidate) await tryAddCandidate(candidates, rejectedCandidates, () => scoreSvgCandidate(
          paletteCandidate.svg,
          `前景色层 · 亚像素轮廓 ${Math.round(paletteSpec.threshold * 255)}`,
          {
            paletteContour: true,
            paletteSpec,
            strokeCount: paletteCandidate.strokeCount,
            fillCount: paletteCandidate.fillCount
          }
        ));
      }
      for (let index = 0; index < contourSpecs.length && candidates.length < settings.candidateLimit; index += 1) {
        if (performance.now() - started > settings.timeBudgetMs) { timedOut = true; break; }
        const spec = contourSpecs[index];
        setStatus(`拟合亚像素 Alpha 轮廓候选 ${index + 1} / ${contourSpecs.length}…`, 'busy');
        await nextPaint();
        const svg = makeContourFillCandidate(spec, layerPlan);
        if (svg) await tryAddCandidate(candidates, rejectedCandidates, () => scoreSvgCandidate(
          svg,
          `Alpha 等值轮廓 ${Math.round(spec.threshold * 255)} · ε${spec.tolerance}`,
          { contour: spec }
        ));
      }
      if (layerPlan.hasTransparency && !gradientFits.fits.length && candidates.length < settings.candidateLimit && performance.now() - started <= settings.timeBudgetMs) {
        setStatus('描摹二值透明边缘候选…', 'busy');
        await nextPaint();
        const binaryAlphaData = binaryAlphaForTrace(state.sourceData, 128);
        await tryAddCandidate(candidates, rejectedCandidates, () => makeTracedCandidate(binaryAlphaData, {
          colors: settings.colors,
          line: Math.max(.05, settings.lineError * .55),
          curve: Math.max(.05, settings.curveError * .55),
          omit: 0
        }, '二值透明边缘'));
      }
      for (let index = 0; index < gradientFits.fits.length && candidates.length < settings.candidateLimit; index += 1) {
        if (performance.now() - started > settings.timeBudgetMs) { timedOut = true; break; }
        setStatus(`拟合${gradientFits.fits[index].kind === 'radial' ? '径向' : '线性'}渐变候选 ${index + 1}…`, 'busy');
        await nextPaint();
        const contour = contourSpecs.find((spec) => spec.gradientPreferred) || null;
        const gradientSvg = makeGradientCandidate(gradientFits.fits[index], settings, contour);
        if (!gradientSvg) continue;
        await tryAddCandidate(candidates, rejectedCandidates, () => scoreSvgCandidate(
          gradientSvg,
          `简单${gradientFits.fits[index].kind === 'radial' ? '径向' : '线性'}渐变`,
          { gradient: gradientFits.fits[index] }
        ));
      }
      if (!candidates.length) throw new Error(noCandidateMessage(rejectedCandidates));
      const best = chooseBestCandidate(candidates);
      state.candidates = candidates;
      const elapsed = performance.now() - started;
      state.selected = best;
      setFinalOutput(best, elapsed, candidates.length, timedOut, rejectedCandidates);
      const skipNote = candidateSkipMessage(rejectedCandidates);
      setStatus(timedOut
        ? `已到 ${settings.timeBudgetSeconds} 秒上限，已从 ${candidates.length} 个完成候选中选出当前最佳结果。${skipNote}`
        : `已完成 ${candidates.length} 个有限候选的真实栅格验收。${skipNote}`);
    } catch (error) {
      console.error(error);
      setStatus(error.message || '转换失败。请尝试减少图片尺寸或颜色数量，并检查浏览器控制台。', 'error');
    } finally {
      state.converting = false;
      el.convert.disabled = false;
    }
  }

  function getSettings() {
    const candidateLimit = clampInt(el.candidateLimit.value, 1, 10, 7);
    const timeBudgetSeconds = clampInt(el.timeBudget.value, 2, 20, 8);
    return {
      colors: clampInt(el.colorCount.value, 2, 32, 12),
      lineError: clampNumber(el.lineError.value, 0.05, 3, .8),
      curveError: clampNumber(el.curveError.value, 0.05, 3, .8),
      pathOmit: clampInt(el.pathOmit.value, 0, 16, 2),
      candidateLimit,
      timeBudgetSeconds,
      timeBudgetMs: timeBudgetSeconds * 1000
    };
  }

  function buildCandidatePlan(settings, maxCount, layerPlan) {
    const standardPlans = [
      { colors: settings.colors, line: settings.lineError, curve: settings.curveError, omit: settings.pathOmit, rightAngle: true, round: 3, sampling: 2, cycles: 5, layering: 0, linefilter: false, label: '色块基线 · 保角' },
      { colors: Math.max(2, settings.colors - 4), line: Math.max(.05, settings.lineError * .68), curve: Math.max(.05, settings.curveError * .65), omit: Math.max(0, settings.pathOmit - 2), rightAngle: true, round: 2, sampling: 2, cycles: 3, layering: 0, linefilter: false, label: '兼容细节基线' },
      { colors: settings.colors, line: Math.max(.03, settings.lineError * .55), curve: Math.max(.03, settings.curveError * .55), omit: 0, rightAngle: false, round: 4, sampling: 2, cycles: 6, layering: 0, linefilter: true, label: '曲线 / 细节优先' },
      { colors: Math.min(48, settings.colors + 6), line: Math.max(.03, settings.lineError * .7), curve: Math.max(.03, settings.curveError * .7), omit: 0, rightAngle: false, round: 4, sampling: 2, cycles: 7, layering: 0, linefilter: false, label: '高颜色细节候选' },
      { colors: settings.colors, line: Math.max(.03, settings.lineError * .42), curve: Math.max(.03, settings.curveError * .42), omit: 0, rightAngle: false, round: 4, sampling: 2, cycles: 5, layering: 1, linefilter: true, label: '并行分层细线' },
      { colors: Math.min(48, settings.colors + 3), line: settings.lineError, curve: settings.curveError, omit: Math.max(0, settings.pathOmit - 1), rightAngle: true, round: 4, sampling: 2, cycles: 6, layering: 1, linefilter: false, label: '相邻色块候选' },
      { colors: Math.max(2, settings.colors - 2), line: Math.min(3, settings.lineError * 1.25), curve: Math.min(3, settings.curveError * 1.25), omit: Math.min(16, settings.pathOmit + 2), rightAngle: false, round: 3, sampling: 2, cycles: 4, layering: 0, linefilter: true, label: '简化曲线候选' }
    ];
    // A mostly opaque image with many color buckets often means a light
    // background plus anti-aliasing, compression noise, or gentle tonal
    // changes. Try a finite conservative plan first so an over-fragmented
    // detailed trace cannot delay all usable candidates.
    const conservativePlan = {
      colors: Math.max(2, Math.min(6, Math.round(settings.colors * .5))),
      line: Math.min(3, Math.max(1.2, settings.lineError * 1.75)),
      curve: Math.min(3, Math.max(1.2, settings.curveError * 1.75)),
      omit: Math.min(16, Math.max(5, settings.pathOmit + 4)),
      rightAngle: false,
      round: 2,
      sampling: 2,
      cycles: 3,
      layering: 0,
      linefilter: true,
      label: '复杂色调 · 保守简化'
    };
    const base = layerPlan?.likelyToneFragmentation ? [conservativePlan, ...standardPlans] : standardPlans;
    const seen = new Set();
    return base.filter((plan) => {
      if (layerPlan?.likelyThinLine && plan.omit > 0) plan.omit = 0;
      const key = [plan.colors, plan.line.toFixed(2), plan.curve.toFixed(2), plan.omit, plan.rightAngle, plan.round, plan.layering].join('/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maxCount);
  }

  async function makeTracedCandidate(imageData, plan, label) {
    const traceStarted = performance.now();
    const rawSvg = window.ImageTracer.imagedataToSVG(imageData, imageTracerOptions(plan));
    const svg = normalizeSvg(rawSvg);
    const candidate = await scoreSvgCandidate(svg, label, { plan, traceMs: performance.now() - traceStarted });
    return candidate;
  }

  function imageTracerOptions(plan) {
    return {
      ltres: plan.line,
      qtres: plan.curve,
      pathomit: plan.omit,
      rightangleenhance: plan.rightAngle ?? false,
      colorsampling: plan.sampling ?? 2,
      numberofcolors: plan.colors,
      mincolorratio: 0,
      colorquantcycles: plan.cycles ?? 5,
      layering: plan.layering ?? 0,
      strokewidth: 0,
      linefilter: plan.linefilter ?? false,
      scale: 1,
      roundcoords: plan.round ?? 4,
      viewbox: true,
      desc: false,
      lcpr: 0,
      qcpr: 0,
      blurradius: 0,
      blurdelta: 20
    };
  }

  function buildForegroundMaskSpecs(layerPlan, settings) {
    if (!layerPlan?.opaqueBackdrop || !layerPlan.likelyToneFragmentation) return [];
    return [{
      distance: 10,
      plan: {
        colors: Math.min(20, Math.max(8, settings.colors + 4)),
        line: settings.lineError,
        curve: settings.curveError,
        omit: Math.max(1, settings.pathOmit),
        rightAngle: true,
        round: 3,
        sampling: 2,
        cycles: 5,
        layering: 0,
        linefilter: false,
        foregroundMask: true,
        label: '稳定底色分离 · 前景描摹'
      }
    }];
  }

  function maskStableBackdrop(imageData, backdrop, distance) {
    const data = new Uint8ClampedArray(imageData.data);
    const [red, green, blue] = backdrop.color;
    const limit = Math.max(1, distance) ** 2;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] <= VISIBLE_ALPHA) continue;
      const squaredDistance = (data[index] - red) ** 2 + (data[index + 1] - green) ** 2 + (data[index + 2] - blue) ** 2;
      if (squaredDistance <= limit) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
      }
    }
    return { width: imageData.width, height: imageData.height, data };
  }

  function sanitizeTransparentPixels(imageData) {
    const data = new Uint8ClampedArray(imageData.data);
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) data[index] = data[index + 1] = data[index + 2] = 0;
    }
    return { width: imageData.width, height: imageData.height, data };
  }

  function binaryAlphaForTrace(imageData, threshold) {
    const data = new Uint8ClampedArray(imageData.data);
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) data[index] = data[index + 1] = data[index + 2] = 0;
      data[index + 3] = data[index + 3] >= threshold ? 255 : 0;
    }
    return { width: imageData.width, height: imageData.height, data };
  }

  async function scoreSvgCandidate(svg, label, meta = {}) {
    const finalizedSvg = applyOpaqueBackdrop(svg);
    const audit = auditSvg(finalizedSvg);
    if (!audit.ok) throw candidateAuditRejection(label, audit);
    const rendered = await rasterizeSvg(finalizedSvg, state.width, state.height);
    const metrics = measureCandidate(state.sourceData, rendered.data, state.width, state.height);
    return {
      svg: finalizedSvg,
      label,
      meta,
      audit,
      rendered,
      metrics,
      bytes: new Blob([finalizedSvg], { type: 'image/svg+xml' }).size,
      pathCount: audit.counts.path
    };
  }

  function applyOpaqueBackdrop(svg) {
    const backdrop = state.layerPlan?.opaqueBackdrop;
    if (!backdrop) return svg;
    const doc = parseSvg(svg);
    const root = doc.documentElement;
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(state.width));
    rect.setAttribute('height', String(state.height));
    rect.setAttribute('fill', `rgb(${backdrop.color.join(',')})`);
    const firstPaintedNode = [...root.children].find((node) => node.localName.toLowerCase() !== 'defs');
    root.insertBefore(rect, firstPaintedNode || null);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
  }

  function candidateAuditRejection(label, audit) {
    const error = new Error(`候选 SVG 未通过结构审计：${audit.errors.join('；')}`);
    error.code = 'candidate-audit-rejected';
    error.candidateLabel = label;
    error.audit = audit;
    return error;
  }

  async function tryAddCandidate(candidates, rejectedCandidates, buildCandidate) {
    try {
      const candidate = await buildCandidate();
      if (candidate) candidates.push(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== 'candidate-audit-rejected') throw error;
      rejectedCandidates.push({
        label: error.candidateLabel || '未命名候选',
        errors: error.audit?.errors || ['结构审计失败'],
        pathCount: error.audit?.counts?.path ?? null
      });
      return null;
    }
  }

  function candidateSkipStats(rejectedCandidates = []) {
    const pathCap = rejectedCandidates.filter((candidate) => candidate.errors.includes(`路径数超过 ${MAX_PATH_COUNT}，疑似不适合作为本 Demo 的矢量结果`)).length;
    return { total: rejectedCandidates.length, pathCap };
  }

  function candidateSkipMessage(rejectedCandidates = []) {
    const { total, pathCap } = candidateSkipStats(rejectedCandidates);
    if (!total) return '';
    if (pathCap) return ` 已跳过 ${pathCap} 个路径超过 ${MAX_PATH_COUNT} 的过度碎片化候选。`;
    return ` 已跳过 ${total} 个未通过结构审计的候选。`;
  }

  function noCandidateMessage(rejectedCandidates = []) {
    const { total, pathCap } = candidateSkipStats(rejectedCandidates);
    if (total && pathCap === total) return `所有候选都因路径数超过 ${MAX_PATH_COUNT} 而被拒绝。请降低颜色数量、提高“路径简化”，或换用边缘更清晰的 PNG。`;
    if (total) return '所有候选均未通过 SVG 结构审计。请降低颜色数量、提高“路径简化”，或换用边缘更清晰的 PNG。';
    return '没有生成可用候选。请降低颜色数量、增大耗时上限，或换用边缘更清晰的 PNG。';
  }

  function normalizeSvg(rawSvg) {
    const doc = parseSvg(rawSvg);
    const root = doc.documentElement;
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    root.setAttribute('width', String(state.width));
    root.setAttribute('height', String(state.height));
    root.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    root.removeAttribute('desc');
    root.querySelectorAll('desc').forEach((node) => node.remove());
    root.querySelectorAll('path').forEach((path) => {
      const opacity = Number(path.getAttribute('opacity') ?? '1');
      if (opacity <= 0.00001) {
        path.remove();
        return;
      }
      // Keep legitimate native strokes. Later stroke candidates are evaluated by
      // the same renderer; stripping them here would make thin-line recovery
      // impossible. ImageTracer's own zero-width stroke remains harmless.
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
  }

  function parseSvg(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.tagName.toLowerCase() !== 'svg') throw new Error('描摹器返回了不可解析的 SVG。请减少颜色数量后重试。');
    return doc;
  }

  async function rasterizeSvg(svg, width, height) {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      return { data: ctx.getImageData(0, 0, width, height), pngBlob };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function deriveSourceFields(imageData, width, height) {
    return {
      alpha: extractAlpha(imageData.data),
      white: compositeRgb(imageData.data, [255, 255, 255]),
      dark: compositeRgb(imageData.data, [27, 31, 42]),
      bbox: visibleBBox(imageData.data, width, height, VISIBLE_ALPHA),
      edges: makeEdgeMap(imageData.data, width, height)
    };
  }

  // This is deliberately a local, explainable "layer intent" pass. It makes
  // no semantic claims beyond source-pixel evidence and only routes which
  // deterministic candidates should be tried.
  function analyzeLayerPlan(imageData, width, height) {
    const data = imageData.data;
    const histogram = new Map();
    const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 90000)));
    let visible = 0;
    let opaque = 0;
    let semitransparent = 0;
    let weightedRed = 0;
    let weightedGreen = 0;
    let weightedBlue = 0;
    let colorWeight = 0;
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];
        if (alpha <= VISIBLE_ALPHA) continue;
        visible += 1;
        if (alpha >= OPAQUE_ALPHA) {
          opaque += 1;
          const key = `${data[index] >> 4}/${data[index + 1] >> 4}/${data[index + 2] >> 4}`;
          histogram.set(key, (histogram.get(key) || 0) + 1);
          weightedRed += data[index];
          weightedGreen += data[index + 1];
          weightedBlue += data[index + 2];
          colorWeight += 1;
        } else {
          semitransparent += 1;
        }
      }
    }
    const palette = [...histogram.entries()].sort((first, second) => second[1] - first[1]);
    const paletteCoverage = palette.slice(0, 4).reduce((sum, item) => sum + item[1], 0) / Math.max(1, opaque);
    const dominantCoverage = (palette[0]?.[1] || 0) / Math.max(1, opaque);
    const vectorPalette = extractInteriorPalette(imageData, 8);
    const topologyMeasured = width * height <= MAX_STRUCTURED_PIXELS;
    const topology = topologyMeasured && window.NativeVectorGeometry?.analyzeAlphaComponents
      ? window.NativeVectorGeometry.analyzeAlphaComponents(imageData, .5)
      : { componentCount: 0, holeCount: 0, components: [], skipped: !topologyMeasured };
    const meaningfulComponents = topology.components.filter((component) => component.area >= Math.max(4, width * height * .00005));
    const likelyThinLine = meaningfulComponents.some((component) => {
      const compactness = component.area / Math.max(1, component.w * component.h);
      return Math.min(component.w, component.h) <= 6 || (compactness < .22 && Math.max(component.w, component.h) >= 18);
    }) || (topology.holeCount > 0 && visible / Math.max(1, width * height) < .45);
    const primaryColor = colorWeight
      ? [Math.round(weightedRed / colorWeight), Math.round(weightedGreen / colorWeight), Math.round(weightedBlue / colorWeight)]
      : [0, 0, 0];
    const flatEligible = opaque >= 24 && (dominantCoverage >= .82 || (palette.length <= 2 && paletteCoverage >= .94));
    const likelyToneFragmentation = opaque / Math.max(1, visible) >= .98 && palette.length >= 48 && dominantCoverage >= .55;
    // Alpha contours describe the visible silhouette, so they are useful for
    // transparent / isolated flat artwork. On a fully opaque multi-colour
    // image the silhouette is merely the complete canvas and would create a
    // deceptively simple, low-fidelity rectangle.
    const alphaContourEligible = flatEligible && (
      semitransparent > 0 ||
      visible / Math.max(1, Math.ceil(width / stride) * Math.ceil(height / stride)) < .96 ||
      palette.length <= 2
    );
    const opaqueBackdrop = estimateOpaqueBackdrop(imageData, width, height, opaque / Math.max(1, visible));
    return {
      visibleRatio: visible / Math.max(1, Math.ceil(width / stride) * Math.ceil(height / stride)),
      opaqueRatio: opaque / Math.max(1, visible),
      semitransparentRatio: semitransparent / Math.max(1, visible),
      paletteBins: palette.length,
      palette: vectorPalette,
      paletteCoverage,
      dominantCoverage,
      primaryColor,
      flatEligible,
      alphaContourEligible,
      likelyToneFragmentation,
      opaqueBackdrop,
      likelyThinLine,
      topology,
      topologyMeasured,
      hasHoles: topology.holeCount > 0,
      hasTransparency: semitransparent > 0 || visible < Math.ceil(width / stride) * Math.ceil(height / stride)
    };
  }

  function estimateOpaqueBackdrop(imageData, width, height, opaqueRatio) {
    if (opaqueRatio < .995 || width < 2 || height < 2) return null;
    const data = imageData.data;
    const bins = new Map();
    let samples = 0;
    const step = Math.max(1, Math.floor((2 * (width + height)) / 1200));
    const add = (x, y) => {
      const index = (y * width + x) * 4;
      if (data[index + 3] < OPAQUE_ALPHA) return;
      const key = `${data[index] >> 3}/${data[index + 1] >> 3}/${data[index + 2] >> 3}`;
      const bin = bins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
      bin.count += 1;
      bin.red += data[index];
      bin.green += data[index + 1];
      bin.blue += data[index + 2];
      bins.set(key, bin);
      samples += 1;
    };
    for (let x = 0; x < width; x += step) { add(x, 0); add(x, height - 1); }
    for (let y = step; y < height - 1; y += step) { add(0, y); add(width - 1, y); }
    let dominant = null;
    bins.forEach((bin) => { if (!dominant || bin.count > dominant.count) dominant = bin; });
    if (!dominant || dominant.count / Math.max(1, samples) < .72) return null;
    return {
      color: [
        Math.round(dominant.red / dominant.count),
        Math.round(dominant.green / dominant.count),
        Math.round(dominant.blue / dominant.count)
      ],
      coverage: dominant.count / samples
    };
  }

  function extractInteriorPalette(imageData, maximum) {
    const bins = new Map();
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < OPAQUE_ALPHA) continue;
      const key = `${data[index] >> 3}/${data[index + 1] >> 3}/${data[index + 2] >> 3}`;
      const bin = bins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
      bin.count += 1;
      bin.red += data[index];
      bin.green += data[index + 1];
      bin.blue += data[index + 2];
      bins.set(key, bin);
    }
    const clusters = [];
    [...bins.values()].sort((first, second) => second.count - first.count).forEach((bin) => {
      const color = [bin.red / bin.count, bin.green / bin.count, bin.blue / bin.count];
      let closest = null;
      let closestDistance = Infinity;
      clusters.forEach((cluster) => {
        const distance = squaredRgbDistance(color, cluster.color);
        if (distance < closestDistance) { closest = cluster; closestDistance = distance; }
      });
      if (closest && closestDistance < 30 * 30) {
        const total = closest.count + bin.count;
        closest.color = closest.color.map((value, index) => (value * closest.count + color[index] * bin.count) / total);
        closest.count = total;
      } else if (clusters.length < maximum * 3) {
        clusters.push({ color, count: bin.count });
      }
    });
    const minimumCount = Math.max(8, [...bins.values()].reduce((sum, bin) => sum + bin.count, 0) * .01);
    return clusters.sort((first, second) => second.count - first.count).filter((cluster) => cluster.count >= minimumCount).slice(0, maximum).map((cluster) => ({
      color: cluster.color.map((value) => Math.round(value)), count: cluster.count
    }));
  }

  function squaredRgbDistance(first, second) {
    return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2;
  }

  function shouldTryPaletteContours(layerPlan, gradientFits) {
    return Boolean(
      window.NativeVectorGeometry?.alphaContourCandidates &&
      !gradientFits.fits.length &&
      layerPlan.hasTransparency &&
      state.width * state.height <= MAX_STRUCTURED_PIXELS &&
      layerPlan.palette?.length >= 1 &&
      layerPlan.palette.length <= 6 &&
      layerPlan.opaqueRatio >= .35
    );
  }

  function buildPaletteContourSpecs(layerPlan, gradientFits) {
    if (!shouldTryPaletteContours(layerPlan, gradientFits)) return [];
    if (layerPlan.likelyThinLine) {
      return [
        // Keep this finite: five joint boundary / stroke-width variants plus
        // two general tracing candidates at the default candidate limit.
        // The range is deliberately centred below .5 because a browser SVG
        // rasterizer and a Lanczos PNG distribute edge coverage differently.
        { threshold: .26, simplify: .11, strokeScale: .88 },
        { threshold: .32, simplify: .12, strokeScale: .91 },
        { threshold: .38, simplify: .14, strokeScale: .94 },
        { threshold: .44, simplify: .16, strokeScale: .97 },
        { threshold: .50, simplify: .18, strokeScale: 1 }
      ];
    }
    return [{ threshold: .5, simplify: .18, strokeScale: 1 }];
  }

  function makePaletteContourCandidate(layerPlan, settings, spec = { threshold: .5, simplify: .18, strokeScale: 1 }) {
    const palette = layerPlan.palette.slice(0, Math.min(6, settings.colors));
    if (!palette.length || !window.NativeVectorGeometry?.alphaContourCandidates) return null;
    const source = state.sourceData;
    const sourceData = source.data;
    const labels = makePaletteLabels(sourceData, palette);
    const components = extractPaletteComponents(labels, sourceData, source.width, source.height, palette.length);
    if (!components.length || components.length > 48) return null;
    const paths = [];
    let strokeCount = 0;
    let fillCount = 0;
    const minimumPixels = Math.max(4, Math.round(state.width * state.height * .00002));
    components.sort((first, second) => first.paletteIndex - second.paletteIndex || second.area - first.area).forEach((component) => {
      const entry = palette[component.paletteIndex];
      if (!entry || component.area < minimumPixels) return;
      // `fitNarrowComponentStroke` needs only the pixel stride and a small
      // calibration factor. Passing the image height here used to make the
      // factor 256 on our fixture, turning a 3 px line into a 768 px stroke.
      const stroke = fitNarrowComponentStroke(component, sourceData, source.width, spec.strokeScale);
      // A palette cluster is useful for assigning pixels, but it can mix an
      // antialiased 3 px line with a much larger flat region.  Pick the most
      // frequent fully-opaque source colour for each connected component so
      // a native stroke retains its own measured colour rather than a blended
      // cluster average.
      const [red, green, blue] = representativeComponentColor(component, sourceData, entry.color);
      if (stroke) {
        paths.push(`<path d="M ${fixed(stroke.x1)} ${fixed(stroke.y1)} L ${fixed(stroke.x2)} ${fixed(stroke.y2)}" fill="none" stroke="rgb(${red},${green},${blue})" stroke-width="${fixed(stroke.width)}" stroke-linecap="butt" stroke-linejoin="round"/>`);
        strokeCount += 1;
        return;
      }
      const mask = new Uint8ClampedArray(sourceData.length);
      component.pixels.forEach((pixel) => { mask[pixel * 4 + 3] = sourceData[pixel * 4 + 3]; });
      const contours = window.NativeVectorGeometry.alphaContourCandidates({ width: source.width, height: source.height, data: mask }, {
        thresholds: [spec.threshold], simplifyTolerances: [spec.simplify], tension: .72, includeTopology: false
      });
      const contour = contours[0];
      if (!contour?.path) return;
      paths.push(`<path d="${contour.path}" fill="rgb(${red},${green},${blue})" fill-rule="evenodd"/>`);
      fillCount += 1;
    });
    return paths.length ? { svg: nativeSvg(paths.join('')), strokeCount, fillCount } : null;
  }

  function makePaletteLabels(data, palette) {
    const labels = new Int16Array(data.length / 4);
    labels.fill(-1);
    for (let pixel = 0, index = 0; index < data.length; index += 4, pixel += 1) {
      if (data[index + 3] <= VISIBLE_ALPHA) continue;
      const color = [data[index], data[index + 1], data[index + 2]];
      let nearest = 0;
      let nearestDistance = Infinity;
      palette.forEach((entry, paletteIndex) => {
        const distance = squaredRgbDistance(color, entry.color);
        if (distance < nearestDistance) { nearest = paletteIndex; nearestDistance = distance; }
      });
      labels[pixel] = nearest;
    }
    return labels;
  }

  function extractPaletteComponents(labels, data, width, height, paletteCount) {
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    const components = [];
    for (let paletteIndex = 0; paletteIndex < paletteCount; paletteIndex += 1) {
      for (let start = 0; start < total; start += 1) {
        if (labels[start] !== paletteIndex || visited[start]) continue;
        let head = 0;
        let tail = 0;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        let weightedArea = 0;
        const pixels = [];
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const pixel = queue[head++];
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          pixels.push(pixel);
          weightedArea += data[pixel * 4 + 3] / 255;
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          const nearby = [pixel - 1, pixel + 1, pixel - width, pixel + width];
          for (let position = 0; position < nearby.length; position += 1) {
            const other = nearby[position];
            if (other < 0 || other >= total) continue;
            if ((position === 0 && x === 0) || (position === 1 && x === width - 1)) continue;
            if (labels[other] === paletteIndex && !visited[other]) { visited[other] = 1; queue[tail++] = other; }
          }
        }
        components.push({ paletteIndex, pixels, area: pixels.length, weightedArea, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
      }
    }
    return components;
  }

  function fitNarrowComponentStroke(component, data, width, scale = 1) {
    const shortSide = Math.min(component.w, component.h);
    const longSide = Math.max(component.w, component.h);
    if (component.area < 10 || shortSide > 8 || longSide / Math.max(1, shortSide) < 3) return null;
    let weight = 0;
    let meanX = 0;
    let meanY = 0;
    component.pixels.forEach((pixel) => {
      const alpha = data[pixel * 4 + 3] / 255;
      weight += alpha;
      meanX += (pixel % width + .5) * alpha;
      meanY += (Math.floor(pixel / width) + .5) * alpha;
    });
    if (weight <= 0) return null;
    meanX /= weight;
    meanY /= weight;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    component.pixels.forEach((pixel) => {
      const alpha = data[pixel * 4 + 3] / 255;
      const dx = pixel % width + .5 - meanX;
      const dy = Math.floor(pixel / width) + .5 - meanY;
      xx += dx * dx * alpha;
      yy += dy * dy * alpha;
      xy += dx * dy * alpha;
    });
    const angle = .5 * Math.atan2(2 * xy, xx - yy);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let minProjection = Infinity;
    let maxProjection = -Infinity;
    component.pixels.forEach((pixel) => {
      const projection = (pixel % width + .5 - meanX) * dx + (Math.floor(pixel / width) + .5 - meanY) * dy;
      minProjection = Math.min(minProjection, projection);
      maxProjection = Math.max(maxProjection, projection);
    });
    const length = maxProjection - minProjection + 1;
    const strokeWidth = component.weightedArea / Math.max(1, length);
    if (strokeWidth < .65 || strokeWidth > 9 || length / strokeWidth < 3) return null;
    return {
      x1: meanX + dx * (minProjection - .5),
      y1: meanY + dy * (minProjection - .5),
      x2: meanX + dx * (maxProjection + .5),
      y2: meanY + dy * (maxProjection + .5),
      width: strokeWidth * scale
    };
  }

  function representativeComponentColor(component, data, fallback) {
    const counts = new Map();
    component.pixels.forEach((pixel) => {
      const index = pixel * 4;
      if (data[index + 3] < 254) return;
      const key = `${data[index]}/${data[index + 1]}/${data[index + 2]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    let selected = null;
    let count = 0;
    counts.forEach((nextCount, key) => {
      if (nextCount > count) { selected = key; count = nextCount; }
    });
    if (!selected) return fallback;
    return selected.split('/').map((value) => Number(value));
  }

  function buildContourSpecs(layerPlan, settings, gradientFits) {
    if (!window.NativeVectorGeometry?.alphaContourCandidates) return [];
    if (!layerPlan.alphaContourEligible && !gradientFits.fits.length) return [];
    const large = state.width * state.height > MAX_STRUCTURED_PIXELS;
    const raw = window.NativeVectorGeometry.alphaContourCandidates(state.sourceData, {
      thresholds: large ? [.5] : [.38, .5, .62],
      simplifyTolerances: large ? [.32] : [.18, .42],
      tension: .72
    });
    const ranked = raw.sort((first, second) => {
      const firstDistance = Math.abs(first.threshold - .5) + first.tolerance * .05;
      const secondDistance = Math.abs(second.threshold - .5) + second.tolerance * .05;
      return firstDistance - secondDistance;
    });
    const picked = [];
    if (gradientFits.fits.length && ranked[0]) {
      ranked[0].gradientPreferred = true;
      picked.push(ranked[0]);
    }
    if (layerPlan.alphaContourEligible) {
      for (const spec of ranked) {
        if (!picked.includes(spec)) picked.push(spec);
        if (picked.length >= 2) break;
      }
    }
    return picked.slice(0, Math.min(2, settings.candidateLimit - 1));
  }

  function nativeSvg(contents) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}" preserveAspectRatio="xMidYMid meet">${contents}</svg>`;
  }

  function makeContourFillCandidate(spec, layerPlan) {
    if (!spec?.path || !layerPlan.alphaContourEligible) return null;
    const [red, green, blue] = layerPlan.primaryColor;
    const fill = `rgb(${red},${green},${blue})`;
    return nativeSvg(`<path d="${spec.path}" fill="${fill}" fill-rule="evenodd"/>`);
  }

  function measureCandidate(source, rendered, width, height) {
    const sourceFields = state.sourceDerived;
    const candidateAlpha = extractAlpha(rendered.data);
    const candidateWhite = compositeRgb(rendered.data, [255, 255, 255]);
    const candidateDark = compositeRgb(rendered.data, [27, 31, 42]);
    const candidateBbox = visibleBBox(rendered.data, width, height, VISIBLE_ALPHA);
    const roi = paddedUnion(sourceFields.bbox, candidateBbox, width, height, 2);
    const candidateEdges = makeEdgeMap(rendered.data, width, height);
    const white = localSsim(sourceFields.white, candidateWhite, 3, width, height, roi);
    const dark = localSsim(sourceFields.dark, candidateDark, 3, width, height, roi);
    const alpha = localSsim(sourceFields.alpha, candidateAlpha, 1, width, height, roi);
    const edgeF1 = edgeSimilarity(sourceFields.edges, candidateEdges, width, height, roi);
    const spill = alphaSpill(source, rendered.data, width, height, sourceFields.bbox);
    const boundary = boundaryAlphaMetrics(source.data, rendered.data, width, height, roi);
    const interiorColorMae = interiorColorError(source.data, rendered.data, width, height, roi);
    const topologyMeasured = width * height <= MAX_STRUCTURED_PIXELS && state.layerPlan?.topologyMeasured;
    const candidateTopology = topologyMeasured && window.NativeVectorGeometry?.analyzeAlphaComponents
      ? window.NativeVectorGeometry.analyzeAlphaComponents(rendered, .5)
      : { componentCount: 0, holeCount: 0, skipped: true };
    const sourceTopology = state.layerPlan?.topology || { componentCount: 0, holeCount: 0 };
    const topologyError = topologyMeasured
      ? Math.abs(sourceTopology.componentCount - candidateTopology.componentCount) + Math.abs(sourceTopology.holeCount - candidateTopology.holeCount)
      : 0;
    const minSsim = Math.min(white, dark, alpha);
    // The minimum SSIM is primary. Boundary/colour/topology penalties only
    // break close cases, so a strong white-background score cannot hide weak alpha.
    const score = minSsim + edgeF1 * .012 - boundary.mae * .045 - interiorColorMae * .018 - topologyError * .004 - Math.min(.015, spill / Math.max(1, width * height));
    return { white, dark, alpha, minSsim, edgeF1, spill, boundaryAlphaMae: boundary.mae, boundaryAlphaP95: boundary.p95, interiorColorMae, topology: candidateTopology, topologyError, score, roi, candidateEdges, candidateAlpha, candidateWhite, candidateDark };
  }

  function chooseBestCandidate(candidates) {
    return candidates.reduce((best, candidate) => {
      if (!best) return candidate;
      const next = candidate.metrics;
      const current = best.metrics;
      if (next.minSsim > current.minSsim + .00025) return candidate;
      if (current.minSsim > next.minSsim + .00025) return best;
      if (next.topologyError < current.topologyError) return candidate;
      if (next.topologyError > current.topologyError) return best;
      if (next.boundaryAlphaMae < current.boundaryAlphaMae - .0005) return candidate;
      if (current.boundaryAlphaMae < next.boundaryAlphaMae - .0005) return best;
      if (next.edgeF1 > current.edgeF1 + .0005) return candidate;
      if (current.edgeF1 > next.edgeF1 + .0005) return best;
      if (next.interiorColorMae < current.interiorColorMae - .0005) return candidate;
      if (current.interiorColorMae < next.interiorColorMae - .0005) return best;
      if (candidate.pathCount < best.pathCount) return candidate;
      if (candidate.pathCount === best.pathCount && candidate.bytes < best.bytes) return candidate;
      return best;
    }, null);
  }

  function boundaryAlphaMetrics(source, candidate, width, height, roi) {
    const differences = [];
    const stride = Math.max(1, Math.ceil(Math.sqrt((roi.w * roi.h) / 60000)));
    let total = 0;
    let count = 0;
    for (let y = roi.y; y < roi.y + roi.h; y += stride) {
      for (let x = roi.x; x < roi.x + roi.w; x += stride) {
        const index = (y * width + x) * 4;
        const first = source[index + 3];
        const second = candidate[index + 3];
        const isBoundary = (first > VISIBLE_ALPHA && first < OPAQUE_ALPHA) || (second > VISIBLE_ALPHA && second < OPAQUE_ALPHA);
        if (!isBoundary) continue;
        const difference = Math.abs(first - second) / 255;
        total += difference;
        count += 1;
        differences.push(difference);
      }
    }
    if (!count) return { mae: 0, p95: 0 };
    differences.sort((first, second) => first - second);
    return { mae: total / count, p95: differences[Math.min(differences.length - 1, Math.floor(differences.length * .95))] };
  }

  function interiorColorError(source, candidate, width, height, roi) {
    const stride = Math.max(1, Math.ceil(Math.sqrt((roi.w * roi.h) / 60000)));
    let total = 0;
    let count = 0;
    for (let y = roi.y; y < roi.y + roi.h; y += stride) {
      for (let x = roi.x; x < roi.x + roi.w; x += stride) {
        const index = (y * width + x) * 4;
        if (source[index + 3] < OPAQUE_ALPHA || candidate[index + 3] < OPAQUE_ALPHA) continue;
        total += Math.abs(source[index] - candidate[index]) + Math.abs(source[index + 1] - candidate[index + 1]) + Math.abs(source[index + 2] - candidate[index + 2]);
        count += 3;
      }
    }
    return count ? total / (count * 255) : 0;
  }

  function setFinalOutput(best, elapsed, candidateCount, timedOut, rejectedCandidates = []) {
    state.svgText = best.svg;
    state.svgBlob = new Blob([state.svgText], { type: 'image/svg+xml' });
    el.download.dataset.svgFingerprint = stringFingerprint(state.svgText);
    if (state.svgUrl) URL.revokeObjectURL(state.svgUrl);
    state.svgUrl = URL.createObjectURL(state.svgBlob);
    const inlineSvg = state.svgText.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
    el.svgStage.replaceChildren();
    el.svgStage.insertAdjacentHTML('beforeend', inlineSvg);
    el.overlaySvg.replaceChildren();
    el.overlaySvg.insertAdjacentHTML('beforeend', inlineSvg);
    el.svgSize.textContent = `${formatBytes(best.bytes)} · ${best.pathCount} 条路径`;
    el.results.hidden = false;
    renderMetrics(best, elapsed, candidateCount, timedOut, rejectedCandidates);
    renderAudit(best.audit, best.pathCount);
    renderLayerPlan(best);
    renderDiffs(state.sourceData.data, best.rendered.data, best.metrics, state.width, state.height);
    renderLimitations(best, timedOut, rejectedCandidates);
    el.download.disabled = false;
    updateComparisonSlider();
    setBackground(state.background);
    setPreviewSize($('.size-button.active')?.dataset.size || '128');
    el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderMetrics(best, elapsed, candidateCount, timedOut, rejectedCandidates = []) {
    const m = best.metrics;
    const passed = m.white >= .99 && m.dark >= .99 && m.alpha >= .99;
    const skipped = candidateSkipStats(rejectedCandidates);
    el.verdict.className = `verdict ${passed ? 'pass' : 'warn'}`;
    el.verdict.dataset.quality = passed ? 'pass' : 'approximate';
    el.verdict.textContent = passed ? '达到本 Demo 的图像相似度目标' : '近似矢量版';
    const items = [
      ['白底 SSIM', formatScore(m.white), 'white-ssim'],
      ['深底 SSIM', formatScore(m.dark), 'dark-ssim'],
      ['Alpha SSIM', formatScore(m.alpha), 'alpha-ssim'],
      ['最低 SSIM', formatScore(m.minSsim), 'min-ssim'],
      ['轮廓 F1', formatScore(m.edgeF1), 'edge-f1'],
      ['边界 Alpha MAE', formatScore(m.boundaryAlphaMae), 'boundary-alpha-mae'],
      ['内部色差 MAE', formatScore(m.interiorColorMae), 'interior-color-mae'],
      [state.layerPlan?.topologyMeasured ? '拓扑差' : '拓扑差（大图跳过）', state.layerPlan?.topologyMeasured ? String(m.topologyError) : '—', 'topology-error'],
      ['耗时', `${(elapsed / 1000).toFixed(2)} s`, 'elapsed'],
      ['候选', `${candidateCount}${timedOut ? '（超时截断）' : ''}`, 'candidate-count'],
      ['跳过候选', skipped.total ? `${skipped.total}${skipped.pathCap ? `（${skipped.pathCap} 个路径超限）` : ''}` : '0', 'candidate-skipped'],
      ['SVG 大小', formatBytes(best.bytes), 'svg-size'],
      ['路径数量', String(best.pathCount), 'path-count'],
      ['ROI', `${m.roi.w} × ${m.roi.h} px`, 'roi'],
      ['外溢像素', String(m.spill), 'alpha-spill'],
      ['选择分', formatScore(m.score), 'selection-score'],
      ['选择项', best.label, 'selection-label']
    ];
    el.metricGrid.replaceChildren(...items.map(([label, value, key]) => metricNode(label, value, key)));
    el.metricDefinition.textContent = `将最终 SVG Blob 栅格化为 ${state.width} × ${state.height} 的 PNG 后评分。候选先比较白底、深底、Alpha 三项中的最低 SSIM，再比较孔洞 / 连通域、边界 Alpha MAE、轮廓与内部色差；ROI 为可见 alpha 并集（阈值 ${VISIBLE_ALPHA}，外扩 2px）。`;
  }

  function metricNode(label, value, key = '') {
    const node = document.createElement('div');
    node.className = 'metric';
    if (key) node.dataset.metric = key;
    const name = document.createElement('span');
    const result = document.createElement('b');
    name.textContent = label;
    result.textContent = value;
    if (value.length > 11) node.classList.add('small');
    node.append(name, result);
    return node;
  }

  function renderLayerPlan(best) {
    if (!el.layerPlanSummary || !el.layerPlanList) return;
    const plan = state.layerPlan || {};
    const m = best.metrics;
    const facts = [];
    facts.push(plan.topologyMeasured ? {
      kind: 'topology', action: 'preserve-contour', validation: m.topologyError === 0 ? 'accepted' : 'fallback',
      title: `连通区域 ${plan.topology?.componentCount ?? '—'} · 镂空 ${plan.topology?.holeCount ?? '—'}`,
      text: m.topologyError === 0 ? '最终 SVG 与原图二值拓扑一致。' : `最终候选仍有 ${m.topologyError} 项拓扑差异；未将它伪装为通过。`
    } : {
      kind: 'topology', action: 'scalable-fallback', validation: 'fallback',
      title: '大图拓扑扫描已跳过',
      text: `为遵守 ${MAX_STRUCTURED_PIXELS.toLocaleString()} 像素的有限计算上限，本次仍执行同尺寸像素验收，但不把未测量的连通域说成一致。`
    });
    if (plan.likelyThinLine) facts.push({
      kind: 'thin-line', action: best.meta?.strokeCount ? 'try-stroke' : 'preserve-contour', validation: (best.meta?.strokeCount || best.meta?.plan?.omit === 0) ? 'accepted' : 'fallback',
      title: '检测到细线 / 空洞风险',
      text: best.meta?.strokeCount
        ? `最终候选保留 ${best.meta.strokeCount} 条经长度 / 宽度稳定性检测的原生描边，其余形状继续按填充轮廓处理。`
        : '细线候选禁用小轮廓剔除，并优先比较曲线与轮廓误差；当前仍用源像素验收，不自动补线。'
    });
    if (plan.alphaContourEligible) facts.push({
      kind: 'flat', action: 'try-alpha-contour', validation: best.meta?.contour ? 'accepted' : 'fallback',
      title: '检测到近似纯色层',
      text: '已额外尝试亚像素 Alpha 等值轮廓，避免将抗锯齿边缘误当成新色块。'
    });
    if (plan.opaqueBackdrop) facts.push({
      kind: 'opaque-backdrop', action: 'preserve-opacity', validation: 'accepted',
      title: '检测到连续不透明边缘底色',
      text: '最终 SVG 在图层底部加入原生 rect，以保留原图的不透明背景；它不包含位图数据。'
    });
    if (best.meta?.plan?.foregroundMask) facts.push({
      kind: 'foreground-mask', action: 'separate-background', validation: 'accepted',
      title: '稳定底色已从前景描摹中分离',
      text: '只将接近边缘底色的像素交给原生 rect，其余前景继续按原图颜色描摹；是否采用仍由同尺寸评分决定。'
    });
    if (best.meta?.gradient) facts.push({
      kind: 'gradient', action: 'fit-gradient', validation: 'accepted',
      title: '简单渐变候选被选中',
      text: '渐变色与轮廓均由原图拟合，并通过同尺寸渲染验收。'
    });
    else facts.push({
      kind: 'candidate', action: 'compare-raster', validation: 'accepted',
      title: '多模型候选已比较',
      text: `保留最低 SSIM ${formatScore(m.minSsim)} 的真实短板，并以边界误差和拓扑作为次级裁决。`
    });
    el.layerPlanSummary.dataset.analysisState = 'ready';
    el.layerPlanSummary.textContent = plan.topologyMeasured
      ? `本地分析识别到 ${plan.paletteBins ?? '—'} 个可靠颜色桶、${plan.topology?.componentCount ?? '—'} 个主体连通区域；它只决定尝试哪些原生 SVG 候选，不能替代像素验收。`
      : `本地分析识别到 ${plan.paletteBins ?? '—'} 个可靠颜色桶；因图片超过结构分析上限，连通区域只保留为未测量状态，不能替代像素验收。`;
    el.layerPlanList.replaceChildren(...facts.map((fact) => {
      const item = document.createElement('li');
      item.dataset.analysisKind = fact.kind;
      item.dataset.action = fact.action;
      item.dataset.validation = fact.validation;
      const title = document.createElement('strong');
      title.textContent = fact.title;
      item.append(title, document.createTextNode(fact.text));
      return item;
    }));
    if (el.localRefinementNote) el.localRefinementNote.textContent = '本面板是本地启发式图层分析，不上传图片、不调用云端或生成式模型。候选只会在原图、同尺寸 SVG 栅格、白底/深底/Alpha、边界和拓扑指标均完成比较后被采用。';
  }

  function renderAudit(audit, pathCount) {
    el.auditState.className = `verdict ${audit.ok ? 'pass' : 'fail'}`;
    el.auditState.textContent = audit.ok ? '通过：原生矢量' : '拒绝导出';
    const c = audit.counts;
    const items = [
      ['path', c.path], ['描边 path', c.strokePath], ['基础几何', c.basicShapes], ['linearGradient', c.lineargradient], ['radialGradient', c.radialgradient],
      ['image', c.image], ['foreignObject', c.foreignobject], ['data URI', c.dataUri], ['外链 URL', c.externalUrl],
      ['事件属性', c.eventAttribute], ['SVG 总节点', c.total], ['路径总数', pathCount], ['审计错误', audit.errors.length]
    ];
    el.auditList.replaceChildren(...items.map(([term, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = String(value);
      if ((term === 'image' || term === 'foreignObject' || term === 'data URI' || term === '外链 URL' || term === '事件属性' || term === '审计错误') && Number(value) > 0) dd.className = 'bad';
      row.append(dt, dd);
      return row;
    }));
  }

  function renderLimitations(best, timedOut, rejectedCandidates = []) {
    const notes = [
      state.gradientNote,
      state.layerPlan?.likelyThinLine
        ? best.meta?.strokeCount
          ? `检测到细线 / 镂空风险：最终 SVG 采用 ${best.meta.strokeCount} 条经原图宽度稳定性验证的 native stroke；非稳定宽度区域仍保留填充轮廓。`
          : '检测到细线 / 镂空风险：已禁用细线候选的小轮廓剔除并比较曲线分层；未达到稳定性条件的区域不会被强行猜成 stroke。'
        : '文字与复杂形状仍按轮廓处理，不进行 OCR、字体重排或补画细节。',
      '相邻色块会比较顺序与并行分层；复杂半透明叠层和全局共享边界仍属于当前限制。'
    ];
    if (best.pathCount > 1200) notes.push('路径数较高：该输入可能超出少色 Logo / 图标的推荐范围。');
    const skipped = candidateSkipStats(rejectedCandidates);
    if (skipped.pathCap) notes.push(`已跳过 ${skipped.pathCap} 个路径超过 ${MAX_PATH_COUNT} 的过度碎片化候选；最终结果仍单独通过结构审计，不会以位图代替。`);
    else if (skipped.total) notes.push(`已跳过 ${skipped.total} 个未通过结构审计的候选；最终结果仍单独通过结构审计。`);
    if (timedOut) notes.push('候选搜索达到耗时上限，展示的是已完成候选中的最佳结果。');
    el.limitations.textContent = notes.join(' ');
  }

  function resetOutput() {
    state.svgText = '';
    state.svgBlob = null;
    state.selected = null;
    if (state.svgUrl) { URL.revokeObjectURL(state.svgUrl); state.svgUrl = null; }
    el.results.hidden = true;
    el.download.disabled = true;
    el.svgStage.replaceChildren();
    el.overlaySvg.replaceChildren();
  }

  function setStatus(text, type = '') {
    el.status.textContent = text;
    el.status.className = `status ${type}`.trim();
  }

  function setBackground(background) {
    state.background = background;
    const stageClass = `stage-${background}`;
    [el.originalStage, el.svgStage, el.overlayStage].forEach((stage) => {
      stage.classList.remove('stage-light', 'stage-dark', 'stage-checker');
      stage.classList.add(stageClass);
    });
    $$('.bg-button').forEach((button) => button.classList.toggle('active', button.dataset.background === background));
  }

  function setPreviewSize(size) {
    const classNames = ['is-32', 'is-128', 'is-original', 'is-zoom'];
    [el.originalStage, el.svgStage].forEach((stage) => {
      stage.classList.remove(...classNames);
      stage.classList.add(`is-${size}`);
    });
    $$('.size-button').forEach((button) => button.classList.toggle('active', button.dataset.size === size));
  }

  function updateComparisonSlider() {
    const value = Number(el.slider.value);
    el.overlayClip.style.clipPath = `inset(0 0 0 ${value}%)`;
    el.sliderLine.style.left = `${value}%`;
  }

  function downloadSvg() {
    if (!state.svgBlob || !state.svgText) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(state.svgBlob);
    link.download = `${state.inputName || 'vectorized'}-native.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function auditSvg(svg) {
    const errors = [];
    const counts = { path: 0, strokePath: 0, basicShapes: 0, lineargradient: 0, radialgradient: 0, image: 0, foreignobject: 0, dataUri: 0, externalUrl: 0, eventAttribute: 0, total: 0 };
    let doc;
    try { doc = parseSvg(svg); } catch (error) { return { ok: false, errors: [error.message], counts }; }
    const root = doc.documentElement;
    if (root.getAttribute('viewBox') !== `0 0 ${state.width} ${state.height}`) errors.push('viewBox 不匹配原始尺寸');
    for (const node of [root, ...root.querySelectorAll('*')]) {
      const tag = node.localName.toLowerCase();
      counts.total += 1;
      if (FORBIDDEN_TAGS.has(tag)) { counts[tag] = (counts[tag] || 0) + 1; errors.push(`禁止元素 <${tag}>`); }
      if (!ALLOWED_TAGS.has(tag)) errors.push(`不在白名单中的元素 <${tag}>`);
      if (tag === 'path') {
        counts.path += 1;
        if (node.getAttribute('stroke') && node.getAttribute('stroke').toLowerCase() !== 'none' && Number(node.getAttribute('stroke-width') || 1) > 0) counts.strokePath += 1;
      }
      if (['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag)) counts.basicShapes += 1;
      if (tag === 'lineargradient') counts.lineargradient += 1;
      if (tag === 'radialgradient') counts.radialgradient += 1;
      if (tag === 'image') counts.image += 1;
      if (tag === 'foreignobject') counts.foreignobject += 1;
      for (const attribute of node.attributes) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith('on')) { counts.eventAttribute += 1; errors.push('事件属性'); }
        if (value.includes('data:') || value.includes('base64')) { counts.dataUri += 1; errors.push('data URI / base64'); }
        if (!/^xmlns(?::|$)/.test(name) && /https?:|file:|javascript:/.test(value)) { counts.externalUrl += 1; errors.push('外链 URL'); }
        if ((name === 'href' || name.endsWith(':href')) && !/^#/.test(value) && !/^url\(#[-\w]+\)$/.test(value)) { counts.externalUrl += 1; errors.push('非本地资源引用'); }
      }
    }
    if (!counts.path && !counts.basicShapes) errors.push('没有可见的原生矢量图元');
    if (counts.path > MAX_PATH_COUNT) errors.push(`路径数超过 ${MAX_PATH_COUNT}，疑似不适合作为本 Demo 的矢量结果`);
    return { ok: !errors.length, errors: [...new Set(errors)], counts };
  }

  function analyzeSimpleGradients(imageData, width, height) {
    const data = imageData.data;
    const bbox = visibleBBox(data, width, height, VISIBLE_ALPHA);
    if (!bbox) return { fits: [], note: '没有可见主体，因此未尝试渐变拟合。' };
    let visible = 0;
    let semitransparent = 0;
    let opaque = 0;
    const samplePoints = [];
    let minChannel = 255;
    let maxChannel = 0;
    const stride = Math.max(1, Math.floor(Math.sqrt((bbox.w * bbox.h) / 12000)));
    for (let y = bbox.y; y < bbox.y + bbox.h; y += stride) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x += stride) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];
        if (alpha > VISIBLE_ALPHA) visible += 1;
        if (alpha > VISIBLE_ALPHA && alpha < 250) semitransparent += 1;
        if (alpha >= 250) {
          opaque += 1;
          const color = [data[index], data[index + 1], data[index + 2]];
          color.forEach((value) => { minChannel = Math.min(minChannel, value); maxChannel = Math.max(maxChannel, value); });
          samplePoints.push({ x: x + .5, y: y + .5, color });
        }
      }
    }
    if (opaque < 96 || !visible) return { fits: [], note: '可用不透明主体像素过少，未尝试渐变拟合。' };
    if (semitransparent / visible > .12) return { fits: [], note: '主体含较多半透明层；为避免错误重建，未尝试简单渐变拟合。' };
    if (maxChannel - minChannel < 14) return { fits: [], note: '颜色变化不足以构成简单渐变，未生成 gradient 候选。' };
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const diagonal = Math.hypot(bbox.w, bbox.h) || 1;
    const specs = [
      linearGradientSpec('linear-horizontal', bbox.x, cy, bbox.x + bbox.w, cy),
      linearGradientSpec('linear-vertical', cx, bbox.y, cx, bbox.y + bbox.h),
      linearGradientSpec('linear-diagonal', bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h),
      linearGradientSpec('linear-antidiagonal', bbox.x, bbox.y + bbox.h, bbox.x + bbox.w, bbox.y),
      { kind: 'radial', name: 'radial-center', cx, cy, r: diagonal / 2, t: (p) => Math.min(1, Math.hypot(p.x - cx, p.y - cy) / (diagonal / 2)) }
    ];
    const fits = specs.map((spec) => fitGradient(samplePoints, spec, bbox)).filter((fit) => fit && fit.rmse <= 13);
    fits.sort((a, b) => a.rmse - b.rmse);
    const picked = [];
    for (const fit of fits) {
      if (!picked.some((other) => other.kind === fit.kind) || picked.length === 0) picked.push(fit);
      if (picked.length >= 2) break;
    }
    if (!picked.length) return { fits: [], note: '已分析线性与中心径向模型，但色彩残差较高；保留色块矢量结果，未伪造 gradient。' };
    const names = picked.map((fit) => fit.kind === 'radial' ? '中心径向' : '一维线性').join('、');
    return { fits: picked, note: `检测到低残差${names}候选；仅在其客观 SSIM 优于色块候选时才会采用。` };
  }

  function linearGradientSpec(name, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    return { kind: 'linear', name, x1, y1, x2, y2, t: (p) => Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / lengthSquared)) };
  }

  function fitGradient(points, spec, bbox) {
    const ts = points.map(spec.t);
    const meanT = average(ts);
    const variance = average(ts.map((value) => (value - meanT) ** 2));
    if (variance < .0001) return null;
    const stops = [[], []];
    let squaredError = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const meanColor = average(points.map((point) => point.color[channel]));
      const covariance = average(points.map((point, index) => (ts[index] - meanT) * (point.color[channel] - meanColor)));
      const slope = covariance / variance;
      const intercept = meanColor - slope * meanT;
      stops[0][channel] = clampNumber(intercept, 0, 255, 0);
      stops[1][channel] = clampNumber(intercept + slope, 0, 255, 0);
      for (let index = 0; index < points.length; index += 1) {
        const expected = clampNumber(intercept + slope * ts[index], 0, 255, 0);
        squaredError += (points[index].color[channel] - expected) ** 2;
      }
    }
    return { ...spec, bbox, stops, rmse: Math.sqrt(squaredError / (points.length * 3)) };
  }

  function gradientMarkup(fit, id) {
    const tag = fit.kind === 'radial' ? 'radialGradient' : 'linearGradient';
    const attrs = fit.kind === 'radial'
      ? `cx="${fixed(fit.cx)}" cy="${fixed(fit.cy)}" r="${fixed(fit.r)}"`
      : `x1="${fixed(fit.x1)}" y1="${fixed(fit.y1)}" x2="${fixed(fit.x2)}" y2="${fixed(fit.y2)}"`;
    const stops = fit.stops.map((color, index) => `<stop offset="${index === 0 ? 0 : 1}" stop-color="rgb(${color.map((value) => Math.round(value)).join(',')})"/>`).join('');
    return `<${tag} id="${id}" gradientUnits="userSpaceOnUse" color-interpolation="sRGB" ${attrs}>${stops}</${tag}>`;
  }

  function makeGradientCandidate(fit, settings, contourSpec = null) {
    const id = `fidelity-${fit.name}`;
    if (contourSpec?.path) {
      return nativeSvg(`<defs>${gradientMarkup(fit, id)}</defs><path d="${contourSpec.path}" fill="url(#${id})" fill-rule="evenodd"/>`);
    }
    try {
      const source = state.sourceData.data;
      const mask = new Uint8ClampedArray(source.length);
      for (let index = 0; index < source.length; index += 4) {
        mask[index + 3] = source[index + 3];
      }
      const raw = window.ImageTracer.imagedataToSVG({ width: state.width, height: state.height, data: mask }, imageTracerOptions({
        colors: 2,
        line: Math.max(.05, settings.lineError * .65),
        curve: Math.max(.05, settings.curveError * .65),
        omit: 0
      }));
      const doc = parseSvg(normalizeSvg(raw));
      const root = doc.documentElement;
      const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const gradient = doc.createElementNS('http://www.w3.org/2000/svg', fit.kind === 'radial' ? 'radialGradient' : 'linearGradient');
      gradient.setAttribute('id', id);
      gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
      gradient.setAttribute('color-interpolation', 'sRGB');
      if (fit.kind === 'radial') {
        gradient.setAttribute('cx', fixed(fit.cx));
        gradient.setAttribute('cy', fixed(fit.cy));
        gradient.setAttribute('r', fixed(fit.r));
      } else {
        ['x1', 'y1', 'x2', 'y2'].forEach((name) => gradient.setAttribute(name, fixed(fit[name])));
      }
      [[0, fit.stops[0]], [1, fit.stops[1]]].forEach(([offset, color]) => {
        const stop = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop.setAttribute('offset', String(offset));
        stop.setAttribute('stop-color', `rgb(${color.map((value) => Math.round(value)).join(',')})`);
        gradient.append(stop);
      });
      defs.append(gradient);
      root.insertBefore(defs, root.firstChild);
      let kept = 0;
      root.querySelectorAll('path').forEach((path) => {
        const opacity = Number(path.getAttribute('opacity') || '1');
        if (opacity <= .00001) { path.remove(); return; }
        path.setAttribute('fill', `url(#${id})`);
        path.removeAttribute('stroke');
        path.removeAttribute('stroke-width');
        kept += 1;
      });
      if (!kept) return null;
      return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
    } catch (error) {
      console.warn('Gradient candidate skipped', error);
      return null;
    }
  }

  function extractAlpha(data) {
    const values = new Float32Array(data.length / 4);
    for (let source = 0, target = 0; source < data.length; source += 4, target += 1) values[target] = data[source + 3];
    return values;
  }

  function compositeRgb(data, background) {
    const values = new Float32Array((data.length / 4) * 3);
    for (let source = 0, target = 0; source < data.length; source += 4) {
      const alpha = data[source + 3] / 255;
      values[target++] = data[source] * alpha + background[0] * (1 - alpha);
      values[target++] = data[source + 1] * alpha + background[1] * (1 - alpha);
      values[target++] = data[source + 2] * alpha + background[2] * (1 - alpha);
    }
    return values;
  }

  function visibleBBox(data, width, height, threshold) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > threshold) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function paddedUnion(first, second, width, height, padding) {
    if (!first && !second) return { x: 0, y: 0, w: width, h: height };
    const minX = Math.max(0, Math.min(first?.x ?? width, second?.x ?? width) - padding);
    const minY = Math.max(0, Math.min(first?.y ?? height, second?.y ?? height) - padding);
    const maxX = Math.min(width - 1, Math.max((first ? first.x + first.w - 1 : -1), (second ? second.x + second.w - 1 : -1)) + padding);
    const maxY = Math.min(height - 1, Math.max((first ? first.y + first.h - 1 : -1), (second ? second.y + second.h - 1 : -1)) + padding);
    return { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
  }

  function makeGaussianKernel(size, sigma) {
    const radius = Math.floor(size / 2);
    const rows = [];
    let total = 0;
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        const weight = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
        rows.push({ x, y, weight });
        total += weight;
      }
    }
    rows.forEach((item) => { item.weight /= total; });
    return rows;
  }

  function localSsim(first, second, channels, width, height, roi) {
    const radius = 5;
    const startX = Math.max(roi.x, radius);
    const startY = Math.max(roi.y, radius);
    const endX = Math.min(width - radius - 1, roi.x + roi.w - 1);
    const endY = Math.min(height - radius - 1, roi.y + roi.h - 1);
    if (endX < startX || endY < startY) return globalSsim(first, second, channels, width, height, roi);
    const area = roi.w * roi.h;
    const stride = Math.max(1, Math.ceil(Math.sqrt(area / 20000)));
    let total = 0;
    let samples = 0;
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    for (let y = startY; y <= endY; y += stride) {
      for (let x = startX; x <= endX; x += stride) {
        for (let channel = 0; channel < channels; channel += 1) {
          let meanA = 0;
          let meanB = 0;
          for (const kernel of SSIM_KERNEL) {
            const offset = ((y + kernel.y) * width + (x + kernel.x)) * channels + channel;
            meanA += kernel.weight * first[offset];
            meanB += kernel.weight * second[offset];
          }
          let varianceA = 0;
          let varianceB = 0;
          let covariance = 0;
          for (const kernel of SSIM_KERNEL) {
            const offset = ((y + kernel.y) * width + (x + kernel.x)) * channels + channel;
            const deltaA = first[offset] - meanA;
            const deltaB = second[offset] - meanB;
            varianceA += kernel.weight * deltaA * deltaA;
            varianceB += kernel.weight * deltaB * deltaB;
            covariance += kernel.weight * deltaA * deltaB;
          }
          total += ((2 * meanA * meanB + C1) * (2 * covariance + C2)) / ((meanA * meanA + meanB * meanB + C1) * (varianceA + varianceB + C2));
          samples += 1;
        }
      }
    }
    return clampNumber(total / Math.max(1, samples), -1, 1, 0);
  }

  function globalSsim(first, second, channels, width, height, roi) {
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    let total = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const valuesA = [];
      const valuesB = [];
      for (let y = roi.y; y < roi.y + roi.h; y += 1) for (let x = roi.x; x < roi.x + roi.w; x += 1) {
        valuesA.push(first[(y * width + x) * channels + channel]);
        valuesB.push(second[(y * width + x) * channels + channel]);
      }
      const meanA = average(valuesA);
      const meanB = average(valuesB);
      const varianceA = average(valuesA.map((value) => (value - meanA) ** 2));
      const varianceB = average(valuesB.map((value) => (value - meanB) ** 2));
      const covariance = average(valuesA.map((value, index) => (value - meanA) * (valuesB[index] - meanB)));
      total += ((2 * meanA * meanB + C1) * (2 * covariance + C2)) / ((meanA * meanA + meanB * meanB + C1) * (varianceA + varianceB + C2));
    }
    return total / channels;
  }

  function makeEdgeMap(data, width, height) {
    const edges = new Uint8Array(width * height);
    const opaque = (x, y) => data[(y * width + x) * 4 + 3] > VISIBLE_ALPHA;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const current = opaque(x, y);
        const left = x > 0 ? opaque(x - 1, y) : false;
        const right = x + 1 < width ? opaque(x + 1, y) : false;
        const up = y > 0 ? opaque(x, y - 1) : false;
        const down = y + 1 < height ? opaque(x, y + 1) : false;
        if (current !== left || current !== right || current !== up || current !== down) edges[y * width + x] = 1;
      }
    }
    return edges;
  }

  function hasNearEdge(edges, x, y, width, height) {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && edges[ny * width + nx]) return true;
    }
    return false;
  }

  function edgeSimilarity(sourceEdges, candidateEdges, width, height, roi) {
    let sourceCount = 0;
    let candidateCount = 0;
    let sourceMatched = 0;
    let candidateMatched = 0;
    for (let y = roi.y; y < roi.y + roi.h; y += 1) for (let x = roi.x; x < roi.x + roi.w; x += 1) {
      const index = y * width + x;
      if (sourceEdges[index]) { sourceCount += 1; if (hasNearEdge(candidateEdges, x, y, width, height)) sourceMatched += 1; }
      if (candidateEdges[index]) { candidateCount += 1; if (hasNearEdge(sourceEdges, x, y, width, height)) candidateMatched += 1; }
    }
    if (!sourceCount && !candidateCount) return 1;
    const precision = candidateMatched / Math.max(1, candidateCount);
    const recall = sourceMatched / Math.max(1, sourceCount);
    return 2 * precision * recall / Math.max(.000001, precision + recall);
  }

  function alphaSpill(source, candidate, width, height, sourceBox) {
    if (!sourceBox) return 0;
    const padded = paddedUnion(sourceBox, sourceBox, width, height, 2);
    let count = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (x >= padded.x && x < padded.x + padded.w && y >= padded.y && y < padded.y + padded.h) continue;
      if (candidate[(y * width + x) * 4 + 3] > VISIBLE_ALPHA) count += 1;
    }
    return count;
  }

  function renderDiffs(source, candidate, metrics, width, height) {
    [el.diff, el.edge].forEach((canvas) => { canvas.width = width; canvas.height = height; });
    const diffContext = el.diff.getContext('2d');
    const edgeContext = el.edge.getContext('2d');
    const diffImage = diffContext.createImageData(width, height);
    const edgeImage = edgeContext.createImageData(width, height);
    const sourceEdges = state.sourceDerived.edges;
    const candidateEdges = metrics.candidateEdges;
    for (let pixel = 0, index = 0; pixel < width * height; pixel += 1, index += 4) {
      const alphaDifference = Math.abs(source[index + 3] - candidate[index + 3]);
      const sr = compositeChannel(source[index], source[index + 3], 255);
      const sg = compositeChannel(source[index + 1], source[index + 3], 255);
      const sb = compositeChannel(source[index + 2], source[index + 3], 255);
      const cr = compositeChannel(candidate[index], candidate[index + 3], 255);
      const cg = compositeChannel(candidate[index + 1], candidate[index + 3], 255);
      const cb = compositeChannel(candidate[index + 2], candidate[index + 3], 255);
      const colorDifference = Math.max(Math.abs(sr - cr), Math.abs(sg - cg), Math.abs(sb - cb));
      const difference = Math.min(255, Math.max(alphaDifference, colorDifference) * 2.2);
      diffImage.data[index] = difference;
      diffImage.data[index + 1] = Math.min(255, difference * .72);
      diffImage.data[index + 2] = Math.min(255, difference * .12);
      diffImage.data[index + 3] = 255;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const sourceOnly = sourceEdges[pixel] && !hasNearEdge(candidateEdges, x, y, width, height);
      const candidateOnly = candidateEdges[pixel] && !hasNearEdge(sourceEdges, x, y, width, height);
      const shared = sourceEdges[pixel] || candidateEdges[pixel];
      if (sourceOnly) { edgeImage.data[index] = 235; edgeImage.data[index + 1] = 68; edgeImage.data[index + 2] = 76; }
      else if (candidateOnly) { edgeImage.data[index] = 20; edgeImage.data[index + 1] = 190; edgeImage.data[index + 2] = 205; }
      else if (shared) { edgeImage.data[index] = 240; edgeImage.data[index + 1] = 246; edgeImage.data[index + 2] = 250; }
      else { edgeImage.data[index] = 25; edgeImage.data[index + 1] = 34; edgeImage.data[index + 2] = 48; }
      edgeImage.data[index + 3] = 255;
    }
    diffContext.putImageData(diffImage, 0, 0);
    edgeContext.putImageData(edgeImage, 0, 0);
  }

  function compositeChannel(value, alpha, background) { return value * (alpha / 255) + background * (1 - alpha / 255); }
  function stringFingerprint(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function average(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
  function clampNumber(value, min, max, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
  function clampInt(value, min, max, fallback) { return Math.round(clampNumber(value, min, max, fallback)); }
  function fixed(value) { return Number(value).toFixed(3).replace(/\.0+$/, ''); }
  function formatScore(value) { return Number.isFinite(value) ? value.toFixed(4) : '—'; }
  function formatBytes(value) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / (1024 * 1024)).toFixed(2)} MB`; }
  function sanitizeFilename(name) { return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80); }
  function nextPaint() { return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))); }
  function loadImage(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('浏览器无法加载图片或 SVG。')); image.src = url; }); }
  function canvasToBlob(canvas, type) { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成 PNG 栅格验证结果。')), type)); }
})();
