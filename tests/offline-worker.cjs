const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
assert(fs.existsSync('sw.js'),'offline app-shell worker must exist');
const source=fs.readFileSync('sw.js','utf8');
const handlers={},storage=new Map(),network=[];let fail=false,skipped=false,claimed=false;
class FakeCache{
 constructor(){this.items=new Map();}
 async addAll(requests){const added=[];for(const req of requests){const url=typeof req==='string'?req:req.url;if(fail&&url.endsWith('app-core.js'))throw Error('network');added.push([url,new Response('cached:'+url)]);}for(const [key,value]of added)this.items.set(key,value);}
 async match(request){return this.items.get(typeof request==='string'?request:request.url)?.clone();}
}
const caches={open:async name=>{if(!storage.has(name))storage.set(name,new FakeCache());return storage.get(name);},keys:async()=>[...storage.keys()],delete:async name=>storage.delete(name)};
const self={registration:{scope:'https://test.example/TreckerLawyer/',active:null},location:{origin:'https://test.example'},clients:{claim:async()=>claimed=true},skipWaiting:async()=>skipped=true,addEventListener:(type,fn)=>handlers[type]=fn};
vm.runInNewContext(source,{self,caches,URL,Request,Response,fetch:async req=>{network.push(req.url||req);return new Response('network');},console});
async function lifecycle(name){let promise;handlers[name]({waitUntil:p=>promise=p});await promise;}
async function request(url,{mode='cors',method='GET'}={}){let promise;handlers.fetch({request:{url,mode,method},respondWith:p=>promise=p,waitUntil(){}});return promise?await promise:null;}
(async()=>{
 await lifecycle('install');assert(skipped,'first worker activates without waiting for a second open');
 const own=[...storage.keys()][0],other='another-app:cache';storage.set(other,new FakeCache());storage.set(own.replace(/[^:]+$/,'obsolete'),new FakeCache());await lifecycle('activate');assert(claimed);assert(storage.has(other),'never remove another app cache');
 assert.equal(await (await request('https://test.example/TreckerLawyer/?source=pwa&v=old',{mode:'navigate'})).text(),'cached:https://test.example/TreckerLawyer/index.html');
 assert.equal(await (await request('https://test.example/TreckerLawyer/index.html?v=anything',{mode:'navigate'})).text(),'cached:https://test.example/TreckerLawyer/index.html');
 assert.equal(await (await request('https://test.example/TreckerLawyer/app-core.js?v=release')).text(),'cached:https://test.example/TreckerLawyer/app-core.js');
 assert.equal(await request('https://qwnkigorqsgugcctnfmj.supabase.co/auth/v1/user'),null,'auth never intercepted or cached');
 assert.equal(await request('https://test.example/OtherApp/'),null,'other app never intercepted');
 assert.equal(await request('https://test.example/TreckerLawyer/reset-cache.html',{mode:'navigate'}),null,'repair page bypasses shell');
 assert.equal(await request('https://test.example/TreckerLawyer/app-core.js',{method:'POST'}),null);
 assert.equal(network.length,0,'cached app shell needs no network');
 const message=async type=>{let pending,result;handlers.message({data:{type},ports:[{postMessage:value=>result=value}],waitUntil:p=>pending=p});await pending;return result;};
 const currentCache=storage.get(own);currentCache.items.delete('https://test.example/TreckerLawyer/app-core.js');
 assert.equal((await message('CHECK_READY')).type,'NOT_READY','cache eviction cannot produce false offline-ready status');
 assert.equal((await message('PREPARE_CACHE')).type,'READY','missing cache can be rebuilt from public assets');
 fail=true;self.registration.active={};skipped=false;vm.runInNewContext(source.replace(/const RELEASE = '[^']+'/,"const RELEASE = 'failed-release'"),{self,caches,URL,Request,Response,fetch:async()=>new Response('network'),console});await assert.rejects(lifecycle('install'));assert(!skipped,'failed update never activates');assert(storage.has(own),'failed install preserves active release');
 console.log('OFFLINE_WORKER_PASS: atomic install, scoped cleanup, query-safe offline shell and no API/auth caching');
})().catch(e=>{console.error(e);process.exitCode=1;});
