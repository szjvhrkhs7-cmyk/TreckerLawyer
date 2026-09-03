const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const appCss = fs.readFileSync('app.css', 'utf8');

const versionPattern = /[?&]v=([^"')\s]+)/g;
const versions = [];
for (const source of [index, appCss]) {
  let match;
  while ((match = versionPattern.exec(source))) versions.push(match[1]);
}

assert(versions.length > 0, 'versioned resources must be present');
const unique = [...new Set(versions)];
assert.deepEqual(unique, ['20260903-hardening-1'], `all first-party resource versions must match: ${unique.join(', ')}`);
assert(!index.includes('maximum-scale=1'), 'viewport must allow user zoom');
assert(!index.includes('user-scalable=no'), 'viewport must allow user zoom');

console.log('cache version tests passed');
