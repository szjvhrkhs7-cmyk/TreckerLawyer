const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const expected = {
  releaseStyles: '\n' + ['priorities.css', 'calendar.css', 'reference-workspace.css'].map(name => `/* ${name} */\n${fs.readFileSync(path.join(root, name), 'utf8')}`).join('\n') + '\n',
  releaseWorkspace: '\n/* reference-workspace.js */\n' + fs.readFileSync(path.join(root, 'reference-workspace.js'), 'utf8') + '\n'
};
for (const [tag, directive] of [['style', 'style-src'], ['script', 'script-src']]) {
  for (const match of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'g'))) {
    if (tag === 'script' && /\bsrc=/.test(match[1])) { assert.equal(match[2].trim(), ''); continue; }
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    assert.ok(id && Object.hasOwn(expected, id), `Only known embedded ${tag} is allowed`);
    assert.equal(match[2], expected[id], 'Run node scripts/embed-page-assets.cjs after editing UI source');
    const hash = crypto.createHash('sha256').update(match[2]).digest('base64');
    assert.ok(policy.split(';').find(item => item.trim().startsWith(directive + ' ')).includes(`'sha256-${hash}'`), `${tag} must have an exact CSP hash`);
  }
}
assert.doesNotMatch(html, /\sstyle\s*=/i);
assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
assert.match(html, /id="releaseStyles"/);
assert.match(html, /id="releaseWorkspace"/);
console.log('PASS embedded UI matches source, exact CSP hashes, no unsafe inline/eval or style attributes');
