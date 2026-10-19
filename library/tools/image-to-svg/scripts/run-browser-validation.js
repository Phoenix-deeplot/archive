#!/usr/bin/env node
'use strict';

/*
 * Optional, developer-only browser acceptance test.
 *
 * The Demo itself has no npm runtime dependencies. This script expects
 * Playwright to be installed (or supplied through PLAYWRIGHT_PACKAGE_PATH),
 * drives the real page, and validates only public UI/output contracts. In
 * particular, it deliberately does not use window.__imageToSvgDebug or any
 * converter-internal state.
 */
const fs = require('node:fs');
const path = require('node:path');

let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
} catch (error) {
  console.error('Playwright is needed only for this optional browser test. Install it with `npm i -D playwright`, then run this script again.');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const baseUrl = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.CHROME_PATH || undefined;
const conversionTimeoutMs = positiveInteger(process.env.CONVERSION_TIMEOUT_MS, 60_000);
const skipQualityBounds = process.env.SKIP_QUALITY_BOUNDS === '1';

/*
 * These are regression floors, not a claim that every input reaches 0.99.
 * The thin-line and JPEG fixtures intentionally retain lower Alpha scores to
 * exercise the honest “近似矢量版” route. Set SKIP_QUALITY_BOUNDS=1 only when
 * investigating a deliberate algorithm/fixture change; structural checks are
 * never skipped.
 */
const fixtures = [
  {
    name: '01-transparent-solid-logo.png',
    minimums: { white: .99, dark: .99, alpha: .99, edgeF1: .99, topology: 0 }
  },
  {
    name: '02-thin-line-knockout-icon.png',
    minimums: { white: .97, dark: .99, alpha: .94, edgeF1: .99 }
  },
  {
    name: '03-transparent-gradient-shape.png',
    minimums: { white: .99, dark: .99, alpha: .99, edgeF1: .98, topology: 0 }
  },
  {
    name: '04-opaque-logo.jpg',
    minimums: { white: .99, dark: .95, alpha: .90, edgeF1: .90 }
  }
].map((fixture) => ({ ...fixture, file: path.join(root, 'test-fixtures', fixture.name) }));
const fixtureLimit = positiveInteger(process.env.FIXTURE_LIMIT, fixtures.length);
const selectedFixtures = fixtures.slice(0, fixtureLimit);

const zeroAuditLabels = ['image', 'foreignObject', 'data URI', '外链 URL', '事件属性', '审计错误'];

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function metricNumber(value) {
  const result = Number.parseFloat(String(value || '').replace(',', '.'));
  return Number.isFinite(result) ? result : null;
}

function formatBound(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function isSameOrHigher(actual, lowerBound) {
  return Number.isFinite(actual) && actual + 0.00005 >= lowerBound;
}

function qualityFailures(metrics, minimums) {
  const metricKeys = {
    white: 'white-ssim',
    dark: 'dark-ssim',
    alpha: 'alpha-ssim',
    edgeF1: 'edge-f1',
    topology: 'topology-error'
  };
  return Object.entries(minimums).flatMap(([name, lowerBound]) => {
    const metricKey = metricKeys[name];
    const actual = metricNumber(metrics[metricKey]);
    if (name === 'topology') {
      return actual === lowerBound ? [] : [`${metricKey}=${metrics[metricKey] ?? '缺失'}，预期 ${lowerBound}`];
    }
    return isSameOrHigher(actual, lowerBound)
      ? []
      : [`${metricKey}=${metrics[metricKey] ?? '缺失'}，最低应为 ${formatBound(lowerBound)}`];
  });
}

function auditPanelFailures(audit) {
  const failures = [];
  if (audit.state !== '通过：原生矢量' || !audit.passClass) failures.push(`结构审计状态不是通过：${audit.state || '缺失'}`);
  for (const label of zeroAuditLabels) {
    if (!Object.prototype.hasOwnProperty.call(audit.rows, label)) failures.push(`结构审计缺少“${label}”`);
    else if (String(audit.rows[label]) !== '0') failures.push(`结构审计“${label}”=${audit.rows[label]}`);
  }
  const nativeCount = Number(audit.rows.path || 0) + Number(audit.rows['基础几何'] || 0);
  if (!Number.isFinite(nativeCount) || nativeCount < 1) failures.push('结构审计没有原生 path 或基础几何');
  return failures;
}

function layerPanelFailures(layer) {
  const failures = [];
  if (layer.summaryState !== 'ready') failures.push(`图层分析状态不是 ready：${layer.summaryState || '缺失'}`);
  if (!layer.summary || /等待.*分析/.test(layer.summary)) failures.push('图层分析摘要仍是占位内容');
  if (!layer.note || !/本地启发式/.test(layer.note)) failures.push('图层分析未说明本地启发式范围');
  if (!layer.items.length) failures.push('图层分析没有任何可验证策略项');
  if (layer.hasPlaceholder) failures.push('图层分析残留占位策略项');
  for (const item of layer.items) {
    if (!item.kind || !item.action || !item.validation || !item.text) failures.push('图层策略项缺少 kind/action/validation/text');
  }
  return failures;
}

function canvasFailures(canvases, source) {
  const failures = [];
  for (const [name, canvas] of Object.entries(canvases)) {
    if (canvas.width !== source.width || canvas.height !== source.height) {
      failures.push(`${name} 尺寸为 ${canvas.width}×${canvas.height}，应与原图 ${source.width}×${source.height} 一致`);
    }
  }
  return failures;
}

function isAllowedRequest(url, localOrigin) {
  if (/^(?:about|blob|data):/i.test(url)) return true;
  try {
    return new URL(url).origin === localOrigin;
  } catch {
    return false;
  }
}

async function downloadText(download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('浏览器没有返回下载内容流。');
  const parts = [];
  for await (const chunk of stream) parts.push(chunk);
  return Buffer.concat(parts).toString('utf8');
}

async function waitForSourceReady(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('#originalPreview');
    const convert = document.querySelector('#convertButton');
    const download = document.querySelector('#downloadButton');
    const results = document.querySelector('#results');
    const status = document.querySelector('#statusLine');
    return Boolean(
      image?.complete
      && image.naturalWidth > 0
      && image.naturalHeight > 0
      && convert
      && !convert.disabled
      && download?.disabled
      && results?.hidden
      && !status?.classList.contains('busy')
      && !status?.classList.contains('error')
    );
  }, undefined, { timeout: conversionTimeoutMs });
}

async function waitForConversionComplete(page) {
  await page.waitForFunction(() => {
    const results = document.querySelector('#results');
    const convert = document.querySelector('#convertButton');
    const download = document.querySelector('#downloadButton');
    const status = document.querySelector('#statusLine');
    const svg = document.querySelector('#svgStage > svg');
    const audit = document.querySelector('#auditState');
    const verdict = document.querySelector('#verdict');
    const metricCount = document.querySelectorAll('#metricGrid [data-metric]').length;
    return Boolean(
      results
      && !results.hidden
      && convert
      && !convert.disabled
      && download
      && !download.disabled
      && svg
      && audit?.classList.contains('pass')
      && verdict?.dataset.quality
      && metricCount >= 10
      && status
      && !status.classList.contains('busy')
      && !status.classList.contains('error')
    );
  }, undefined, { timeout: conversionTimeoutMs });
}

async function collectUiSnapshot(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    const metrics = Object.fromEntries([...document.querySelectorAll('#metricGrid [data-metric]')]
      .map((node) => [node.dataset.metric, node.querySelector('b')?.textContent?.trim() || '']));
    const auditRows = Object.fromEntries([...document.querySelectorAll('#auditList > div')]
      .map((node) => [node.querySelector('dt')?.textContent?.trim() || '', node.querySelector('dd')?.textContent?.trim() || '']));
    const original = document.querySelector('#originalPreview');
    const rendered = document.querySelector('#svgStage > svg');
    const toCanvasSize = (selector) => {
      const canvas = document.querySelector(selector);
      return { width: canvas?.width || 0, height: canvas?.height || 0 };
    };
    return {
      status: text('#statusLine'),
      statusClass: document.querySelector('#statusLine')?.className || '',
      source: { width: original?.naturalWidth || 0, height: original?.naturalHeight || 0 },
      preview: {
        svgCount: document.querySelectorAll('#svgStage > svg').length,
        viewBox: rendered?.getAttribute('viewBox') || '',
        width: rendered?.getAttribute('width') || '',
        height: rendered?.getAttribute('height') || ''
      },
      verdict: { text: text('#verdict'), quality: document.querySelector('#verdict')?.dataset.quality || '' },
      metrics,
      audit: {
        state: text('#auditState'),
        passClass: document.querySelector('#auditState')?.classList.contains('pass') || false,
        rows: auditRows
      },
      layer: {
        summary: text('#layerPlanSummary'),
        summaryState: document.querySelector('#layerPlanSummary')?.dataset.analysisState || '',
        note: text('#localRefinementNote'),
        hasPlaceholder: Boolean(document.querySelector('#layerPlanList .layer-plan-placeholder')),
        items: [...document.querySelectorAll('#layerPlanList > li')].map((item) => ({
          kind: item.dataset.analysisKind || '',
          action: item.dataset.action || '',
          validation: item.dataset.validation || '',
          text: item.textContent?.trim() || ''
        }))
      },
      canvases: {
        difference: toCanvasSize('#differenceCanvas'),
        edge: toCanvasSize('#edgeCanvas')
      },
      expectedFingerprint: document.querySelector('#downloadButton')?.dataset.svgFingerprint || ''
    };
  });
}

/*
 * Inspect the downloaded string in the page's native XML parser. This catches
 * disallowed constructs regardless of capitalization and also compares a
 * canonical DOM representation with the inline SVG that users see. Exact
 * byte/source equivalence is separately proved with the page-published FNV
 * fingerprint, which is computed from the single accepted SVG string.
 */
async function inspectDownloadedSvg(page, svgText, expected) {
  return page.evaluate(({ svgText: downloaded, expectedWidth, expectedHeight }) => {
    const canonical = (node) => {
      const name = node.localName?.toLowerCase() || node.nodeName.toLowerCase();
      const attributes = [...node.attributes]
        .filter((attribute) => !/^xmlns(?::|$)/i.test(attribute.name))
        .map((attribute) => `${attribute.name.toLowerCase()}=${JSON.stringify(attribute.value)}`)
        .sort()
        .join(',');
      const children = [...node.children].map(canonical).join('');
      return `<${name} ${attributes}>${children}</${name}>`;
    };
    const parser = new DOMParser();
    const documentSvg = parser.parseFromString(downloaded, 'image/svg+xml');
    const parserError = documentSvg.querySelector('parsererror')?.textContent?.trim() || '';
    const root = parserError ? null : documentSvg.documentElement;
    const preview = document.querySelector('#svgStage > svg');
    const tagCounts = {};
    const violations = [];
    let tinyRectCount = 0;
    if (root) {
      for (const node of [root, ...root.querySelectorAll('*')]) {
        const tag = node.localName.toLowerCase();
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        if (['image', 'foreignobject', 'script', 'iframe', 'use', 'style', 'filter', 'pattern', 'text', 'feimage'].includes(tag)) {
          violations.push(`禁止元素 <${tag}>`);
        }
        if (tag === 'rect') {
          const width = Number(node.getAttribute('width'));
          const height = Number(node.getAttribute('height'));
          if (Number.isFinite(width) && Number.isFinite(height) && width <= 1.01 && height <= 1.01) tinyRectCount += 1;
        }
        for (const attribute of node.attributes) {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim().toLowerCase();
          if (/^xmlns(?::|$)/.test(name)) continue;
          if (name.startsWith('on')) violations.push(`事件属性 ${name}`);
          if (value.includes('data:') || value.includes('base64')) violations.push(`位图数据 ${name}`);
          if (/url\(\s*['"]?(?:https?:|file:|javascript:|\/\/|data:)/i.test(value)) violations.push(`外链 URL ${name}`);
          if (/^(?:https?:|file:|javascript:|\/\/)/i.test(value)) violations.push(`外链 URL ${name}`);
          if ((name === 'href' || name.endsWith(':href')) && !/^#/.test(value) && !/^url\(#[-\w]+\)$/.test(value)) {
            violations.push(`非本地引用 ${name}`);
          }
        }
      }
    }
    const expectedViewBox = `0 0 ${expectedWidth} ${expectedHeight}`;
    const nativeCount = (tagCounts.path || 0) + (tagCounts.rect || 0) + (tagCounts.circle || 0) + (tagCounts.ellipse || 0)
      + (tagCounts.line || 0) + (tagCounts.polyline || 0) + (tagCounts.polygon || 0);
    const expectedFingerprint = document.querySelector('#downloadButton')?.dataset.svgFingerprint || '';
    let actualFingerprint = 0x811c9dc5;
    for (let index = 0; index < downloaded.length; index += 1) {
      actualFingerprint ^= downloaded.charCodeAt(index);
      actualFingerprint = Math.imul(actualFingerprint, 0x01000193);
    }
    const fingerprint = (actualFingerprint >>> 0).toString(16).padStart(8, '0');
    return {
      parserError,
      viewBox: root?.getAttribute('viewBox') || '',
      previewViewBox: preview?.getAttribute('viewBox') || '',
      expectedViewBox,
      previewSvgCount: document.querySelectorAll('#svgStage > svg').length,
      fingerprint,
      expectedFingerprint,
      fingerprintMatches: Boolean(expectedFingerprint) && fingerprint === expectedFingerprint,
      previewMatchesDownloaded: Boolean(root && preview) && canonical(root) === canonical(preview),
      nativeCount,
      tagCounts,
      tinyRectCount,
      violations: [...new Set(violations)]
    };
  }, { svgText, expectedWidth: expected.width, expectedHeight: expected.height });
}

function svgInspectionFailures(inspection) {
  const failures = [];
  if (inspection.parserError) failures.push(`下载的 SVG 不是可解析 XML：${inspection.parserError.slice(0, 180)}`);
  if (inspection.viewBox !== inspection.expectedViewBox) failures.push(`下载 SVG viewBox=${inspection.viewBox || '缺失'}，应为 ${inspection.expectedViewBox}`);
  if (inspection.previewViewBox !== inspection.expectedViewBox) failures.push(`页面预览 viewBox=${inspection.previewViewBox || '缺失'}，应为 ${inspection.expectedViewBox}`);
  if (inspection.previewSvgCount !== 1) failures.push(`页面预览 SVG 数量为 ${inspection.previewSvgCount}，应为 1`);
  if (!inspection.fingerprintMatches) failures.push('下载内容与页面公布的最终 SVG 指纹不一致');
  if (!inspection.previewMatchesDownloaded) failures.push('下载 SVG 与页面预览的规范化 DOM 不一致');
  if (inspection.nativeCount < 1) failures.push('下载 SVG 不包含原生 path 或基础几何图元');
  if (inspection.tinyRectCount > 64) failures.push(`检测到 ${inspection.tinyRectCount} 个 1px 小矩形，疑似像素方块模拟`);
  failures.push(...inspection.violations);
  return failures;
}

async function exerciseControls(page) {
  const backgrounds = {};
  for (const background of ['dark', 'checker', 'light']) {
    await page.locator(`.bg-button[data-background="${background}"]`).click();
    backgrounds[background] = await page.evaluate((value) => ['#originalStage', '#svgStage', '#overlayStage']
      .every((selector) => document.querySelector(selector)?.classList.contains(`stage-${value}`)), background);
  }
  const sizes = {};
  for (const size of ['32', '128', 'original', 'zoom']) {
    await page.locator(`.size-button[data-size="${size}"]`).click();
    sizes[size] = await page.evaluate((value) => ['#originalStage', '#svgStage']
      .every((selector) => document.querySelector(selector)?.classList.contains(`is-${value}`)), size);
  }
  await page.locator('.size-button[data-size="128"]').click();
  const slider = page.locator('#compareSlider');
  const before = Number(await slider.inputValue());
  await slider.press('ArrowRight');
  const expectedValue = Math.min(100, before + 1);
  const overlayMoved = await page.evaluate((value) => {
    const clip = document.querySelector('#overlaySvgClip')?.style.clipPath || '';
    const line = document.querySelector('#sliderLine')?.style.left || '';
    return clip.includes(`${value}%`) && line === `${value}%`;
  }, expectedValue);
  return { backgrounds, sizes, overlayMoved };
}

async function validateFixture(page, fixture, options) {
  await page.setInputFiles('#fileInput', fixture.file);
  await waitForSourceReady(page);
  await page.locator('#convertButton').click();
  await waitForConversionComplete(page);
  const ui = await collectUiSnapshot(page);
  const controls = options.exerciseControls ? await exerciseControls(page) : null;

  if (options.screenshotPath && fixture.name === options.screenshotFixture) {
    await page.locator('.bg-button[data-background="light"]').click();
    await page.locator('.size-button[data-size="128"]').click();
    await page.screenshot({ path: options.screenshotPath, fullPage: true });
  }

  const downloadPromise = page.waitForEvent('download', { timeout: conversionTimeoutMs });
  await page.locator('#downloadButton').click();
  const download = await downloadPromise;
  const exportedText = await downloadText(download);
  const inspection = await inspectDownloadedSvg(page, exportedText, ui.source);

  const failures = [
    ...auditPanelFailures(ui.audit),
    ...layerPanelFailures(ui.layer),
    ...canvasFailures(ui.canvases, ui.source),
    ...svgInspectionFailures(inspection)
  ];
  const quality = {
    skipped: skipQualityBounds,
    minimums: fixture.minimums,
    failures: skipQualityBounds ? [] : qualityFailures(ui.metrics, fixture.minimums)
  };
  failures.push(...quality.failures);

  return {
    fixture: fixture.name,
    source: ui.source,
    status: ui.status,
    verdict: ui.verdict,
    metrics: ui.metrics,
    quality,
    audit: ui.audit,
    layer: {
      summary: ui.layer.summary,
      summaryState: ui.layer.summaryState,
      strategyCount: ui.layer.items.length,
      hasPlaceholder: ui.layer.hasPlaceholder
    },
    canvases: ui.canvases,
    preview: ui.preview,
    controls,
    download: {
      suggestedFilename: download.suggestedFilename(),
      bytes: Buffer.byteLength(exportedText),
      fingerprint: fingerprint(exportedText),
      fingerprintMatchesPage: inspection.fingerprintMatches,
      previewMatchesDownloaded: inspection.previewMatchesDownloaded
    },
    svg: {
      viewBox: inspection.viewBox,
      expectedViewBox: inspection.expectedViewBox,
      nativeVectorNodes: inspection.nativeCount,
      tagCounts: inspection.tagCounts,
      tinyRectCount: inspection.tinyRectCount,
      violations: inspection.violations
    },
    failures,
    pass: failures.length === 0
  };
}

async function main() {
  const missingFixtures = selectedFixtures.filter((fixture) => !fs.existsSync(fixture.file)).map((fixture) => fixture.file);
  if (missingFixtures.length) throw new Error(`缺少浏览器验收样例：${missingFixtures.join(', ')}`);

  const browser = await playwright.chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  const unexpectedRequests = [];
  const localOrigin = new URL(baseUrl).origin;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (!isAllowedRequest(url, localOrigin)) unexpectedRequests.push({ method: request.method(), url });
  });

  const results = [];
  let bootstrapError = '';
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: conversionTimeoutMs });
    await page.waitForSelector('#fileInput');
    for (let index = 0; index < selectedFixtures.length; index += 1) {
      const fixture = selectedFixtures[index];
      try {
        results.push(await validateFixture(page, fixture, {
          exerciseControls: index === 0,
          screenshotPath: process.env.SCREENSHOT_PATH || '',
          screenshotFixture: process.env.SCREENSHOT_FIXTURE || selectedFixtures[0].name
        }));
      } catch (error) {
        results.push({ fixture: fixture.name, pass: false, failures: [error.message || String(error)] });
      }
    }
  } catch (error) {
    bootstrapError = error.message || String(error);
  } finally {
    await browser.close();
  }

  const controls = results[0]?.controls;
  const controlsPass = Boolean(controls)
    && Object.values(controls.backgrounds).every(Boolean)
    && Object.values(controls.sizes).every(Boolean)
    && controls.overlayMoved;
  const report = {
    baseUrl,
    qualityBoundsSkipped: skipQualityBounds,
    conversionTimeoutMs,
    bootstrapError,
    pageErrors,
    unexpectedRequests,
    controlsPass,
    results,
    pass: !bootstrapError
      && pageErrors.length === 0
      && unexpectedRequests.length === 0
      && controlsPass
      && results.length === selectedFixtures.length
      && results.every((result) => result.pass)
  };
  return report;
}

main().then((report) => {
  // Playwright can retain a transport handle briefly on Windows even after
  // browser.close().  Flush the complete report first, then end this optional
  // one-shot verifier deterministically instead of leaving a stale Node task.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, () => process.exit(report.pass ? 0 : 1));
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`, () => process.exit(1));
});
