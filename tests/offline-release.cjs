const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lawyer-release-'));
try{
 const worker=fs.readFileSync('sw.js','utf8'),assets=JSON.parse(worker.match(/const ASSETS = ([\s\S]*?);\nconst BASE/)[1]);
 for(const {path:name}of assets){const target=path.join(temp,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(name,target);}
 fs.mkdirSync(path.join(temp,'scripts'),{recursive:true});const builder=path.join(temp,'scripts/build-offline-worker.cjs');fs.copyFileSync('scripts/build-offline-worker.cjs',builder);
 const build=()=>{cp.execFileSync(process.execPath,[builder]);return fs.readFileSync(path.join(temp,'sw.js'),'utf8').match(/const RELEASE = '([^']+)'/)[1];};
 const before=build();fs.appendFileSync(builder,'\n// Worker implementation revision without changing cached assets.\n');
 assert.notEqual(build(),before,'worker implementation changes must use a new cache, preserving active cache on failure');
 console.log('OFFLINE_RELEASE_PASS: worker-only changes cannot collide with active cache');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
