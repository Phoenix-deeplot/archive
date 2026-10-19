#!/usr/bin/env node
'use strict';

// Offline companion audit for a downloaded SVG. It deliberately has no XML
// dependency: the browser UI does the authoritative DOM audit before download,
// while this tool catches prohibited constructs in a saved file as a second check.
const fs = require('node:fs');
const path = require('node:path');

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node scripts/verify-export.js path/to/output.svg');
  process.exit(2);
}
let text;
try { text = fs.readFileSync(filename, 'utf8'); }
catch (error) { console.error(`Cannot read ${filename}: ${error.message}`); process.exit(2); }

const checks = [
  ['<image', /<\s*image\b/i],
  ['<foreignObject', /<\s*foreignObject\b/i],
  ['<script', /<\s*script\b/i],
  ['data: / base64', /(?:data:|base64)/i],
  ['external URL', /(?:https?:|file:|javascript:)/i],
  ['event handler', /\son[a-z]+\s*=/i]
];
const failures = checks.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
const count = (pattern) => (text.match(pattern) || []).length;
const summary = {
  file: path.resolve(filename),
  bytes: Buffer.byteLength(text),
  path: count(/<\s*path\b/gi),
  basicShapes: count(/<\s*(?:rect|circle|ellipse|line|polyline|polygon)\b/gi),
  linearGradient: count(/<\s*linearGradient\b/gi),
  radialGradient: count(/<\s*radialGradient\b/gi),
  hasViewBox: /<\s*svg\b[^>]*\bviewBox\s*=\s*["'][^"']+["']/i.test(text),
  failures
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.hasViewBox || !(summary.path + summary.basicShapes) || failures.length) process.exit(1);
