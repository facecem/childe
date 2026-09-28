/* Bündelt src/ zu einer einzigen Datei: dist/Verwaltungs-Assistent.html
 * Aufruf: node build.js   (keine Abhängigkeiten) */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist', 'Verwaltungs-Assistent.html');
// Reihenfolge = Architektur: core → docs → ui → modules → demo
const JS = ['core.js', 'docs.js', 'ui.js', 'opos.js', 'ih.js', 'kaution.js', 'demo.js'];

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const js = JS.map(f => '/* ===== ' + f + ' ===== */\n' + read(f)).join('\n')
  .replace(/<\/script/gi, '<\\/script');
const html = read('index.html')
  .replace('/*@@CSS@@*/', () => read('style.css'))
  .replace('/*@@JS@@*/', () => js);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('✓ ' + path.relative(__dirname, OUT) + ' (' + kb + ' KB)');
if (Buffer.byteLength(html) > 2 * 1024 * 1024) { console.error('✗ Datei größer als 2 MB'); process.exit(1); }
