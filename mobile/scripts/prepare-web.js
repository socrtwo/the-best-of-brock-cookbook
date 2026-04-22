#!/usr/bin/env node
// Stage the cookbook web app into ./www so Capacitor can bundle it into the
// iOS/Android projects. Copies:
//   ../index.html, ../manifest.webmanifest, ../sw.js, ../assets/**,
//   ../epub_work/OEBPS/**,  ../TheBestofBrock.epub
// into mobile/www/ preserving the relative layout expected by index.html.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'www');

const INCLUDES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'TheBestofBrock.epub',
  'assets',
  path.join('epub_work', 'OEBPS')
];

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

for (const rel of INCLUDES) {
  const src = path.join(ROOT, rel);
  const dst = path.join(OUT, rel);
  if (!fs.existsSync(src)) {
    console.warn('skip (missing):', rel);
    continue;
  }
  copyRecursive(src, dst);
  console.log('copied', rel);
}

console.log('Web assets staged in', OUT);
