// Read-only availability checks; does not authenticate a user or modify cloud records.
const fs=require('node:fs');
const source=fs.readFileSync('sync-core.js','utf8');
const url=source.match(/const SUPABASE_URL = '([^']+)'/)[1];
const key=source.match(/const SUPABASE_KEY = '([^']+)'/)[1];
(async()=>{
 const settings=await fetch(url+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(20000)});
 console.log('Auth settings HTTP',settings.status);
 if(!settings.ok)throw new Error('Cloud auth endpoint is unavailable');
 const data=await fetch(url+'/rest/v1/lawyer_store?select=storage_key&user_id=eq.00000000-0000-0000-0000-000000000000&limit=1',{headers:{apikey:key},signal:AbortSignal.timeout(20000)});
 console.log('Data endpoint HTTP',data.status);
 if(![200,401,403].includes(data.status))throw new Error('Cloud data endpoint is unavailable');
 console.log('CLOUD_ENDPOINTS_PASS');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
