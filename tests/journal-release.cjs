const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const nav=html.match(/<nav class="tabs"[\s\S]*?<\/nav>/)[0];
assert.deepEqual([...nav.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['priorities','tasks','settings']);
assert(!nav.includes('Сегодня'));
console.log('PASS approved release navigation: priorities, tasks, settings');
