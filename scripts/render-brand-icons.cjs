// Render the approved vector mark; no generated raster or font dependency.
const fs=require('node:fs/promises'),path=require('node:path');
let sharp;try{sharp=require('sharp');}catch{sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp');}
(async()=>{
 const root=path.resolve(__dirname,'..'),svg=await fs.readFile(path.join(root,'app-icon.svg'));
 for(const size of [32,180,192,512]){
  const file=path.join(root,`tracker-bookmark-${size}.png`);
  await sharp(svg,{density:384}).resize(size,size).png().toFile(file);
  const meta=await sharp(file).metadata();if(meta.width!==size||meta.height!==size)throw Error('Wrong icon size');
  console.log(`Verified tracker-bookmark-${size}.png (${meta.width}×${meta.height})`);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
