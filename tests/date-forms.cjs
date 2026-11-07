const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),workspace=fs.readFileSync('reference-workspace.js','utf8');
assert.match(html, /src="date-picker\.js\?v=/, 'custom date component must load before workspace');
assert.match(workspace, /DateFields\.enhance\(taskForm\)/);
assert.match(workspace, /DateFields\.enhance\(priorityForm\)/);
console.log('PASS shared compact date component is connected to task and priority forms');
