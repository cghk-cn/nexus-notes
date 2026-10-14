#!/usr/bin/env node
/*
 * build.js — 以 note-app.html 為唯一來源，產生桌面版 app/index.html。
 * 把 CDN 腳本路徑改寫成本機 ./vendor/* 讓桌面版完全離線運作。
 * 用法： node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'note-app.html');
const OUT_DIR = path.resolve(__dirname, 'app');
const OUT = path.join(OUT_DIR, 'index.html');

/* 來源中使用的 CDN 網址 → 本機相對路徑（相對於 app/index.html） */
const REPLACEMENTS = [
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', './vendor/pdf.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', './vendor/html2canvas.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', './vendor/pdf.worker.min.js'],
  ['https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', './vendor/pdf-lib.min.js'],
];

let html = fs.readFileSync(SRC, 'utf8');

let replaced = 0;
for (const [from, to] of REPLACEMENTS) {
  if (html.indexOf(from) === -1) {
    console.warn('[build] 警告：在來源中找不到 ' + from + '（可能來源已變更）');
    continue;
  }
  html = html.split(from).join(to);
  replaced++;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

console.log(`[build] 已寫入 ${OUT}`);
console.log(`[build] 已將 ${replaced} 個 CDN 參考改寫為本機 ./vendor/* 路徑`);
const left = (html.match(/https?:\/\/cdnjs/gi) || []).length;
if (left) console.warn(`[build] 警告：仍殘留 ${left} 個 cdnjs 參考`);
