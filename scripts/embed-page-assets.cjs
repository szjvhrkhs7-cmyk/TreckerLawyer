/* Keep the release UI available even when a separate asset request fails. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = text => 'sha256-' + crypto.createHash('sha256').update(text).digest('base64');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = '\n' + ['priorities.css', 'calendar.css', 'reference-workspace.css'].map(name => `/* ${name} */\n${fs.readFileSync(path.join(root, name), 'utf8')}`).join('\n') + '\n';
const js = '\n/* reference-workspace.js */\n' + fs.readFileSync(path.join(root, 'reference-workspace.js'), 'utf8') + '\n';
if (/<\/style/i.test(css) || /<\/script/i.test(js)) throw new Error('Unexpected closing tag in embedded asset');
const style = `<style id="releaseStyles">${css}</style>`;
const script = `<script id="releaseWorkspace">${js}</script>`;
if (html.includes('<style id="releaseStyles">')) html = html.replace(/<style id="releaseStyles">[\s\S]*?<\/style>/, () => style);
else html = html.replace(/  <link rel="stylesheet" href="priorities\.css[^\n]*\n  <link rel="stylesheet" href="calendar\.css[^\n]*\n  <link rel="stylesheet" href="reference-workspace\.css[^\n]*/, () => '  ' + style);
if (html.includes('<script id="releaseWorkspace">')) html = html.replace(/<script id="releaseWorkspace">[\s\S]*?<\/script>/, () => script);
else html = html.replace(/<script src="reference-workspace\.js[^"]*"><\/script>/, () => script);
html = html.replace(/style-src [^;]+;/, `style-src 'self' '${hash(css)}';`).replace(/script-src [^;]+;/, `script-src 'self' '${hash(js)}';`);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('Embedded release styles and workspace with exact CSP hashes.');
