const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('theme-init.js', 'utf8');
const original = 'width=device-width, initial-scale=1, viewport-fit=cover';
for (const [navigator, ios] of [
  [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }, true],
  [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 }, true],
  [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 }, false],
  [{ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 }, false]
]) {
  const viewport = { content: original };
  const context = { navigator, document: { documentElement: { dataset: {}, style: {} }, querySelector: selector => selector === 'meta[name="viewport"]' ? viewport : null } };
  vm.runInNewContext(source, context);
  assert.equal(viewport.content.includes('maximum-scale=1'), ios, 'only iOS receives the automatic focus zoom safeguard');
  assert(viewport.content.includes(original), 'safe area and initial viewport remain intact');
  assert(!viewport.content.includes('user-scalable=no'), 'does not disable user scaling');
  vm.runInNewContext(source, context);
  assert.equal((viewport.content.match(/maximum-scale/g) || []).length, ios ? 1 : 0, 'safe to initialize twice');
}
console.log('PASS iOS viewport safeguard: iPhone, iPad desktop mode, unchanged macOS/Android, idempotence');
