/** Resumable upload; each content-addressed chunk is downloaded and verified.
 * Only after every chunk verifies do we commit the file manifest. */
import {createClient} from '@supabase/supabase-js';
import {readdir,open,stat} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]??'.');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const bucket=client.storage.from('bookkit-assets');
const CHUNK_SIZE=8*1024*1024;
const must=async q=>{const {data,error}=await q;if(error)throw error;return data;};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function walk(dir){
 const entries=await readdir(dir,{withFileTypes:true});
 const files=[];
 for(const e of entries){
  if(['.git','.DS_Store','__pycache__','node_modules'].includes(e.name)||e.name.endsWith('.pyc'))continue;
  if(e.isSymbolicLink())throw new Error('Resolve symlink explicitly: '+join(dir,e.name));
  if(e.isDirectory())files.push(...await walk(join(dir,e.name)));else if(e.isFile())files.push(join(dir,e.name));
 }
 return files;
}
async function retry(fn){let error;for(let n=0;n<4;n++){try{return await fn();}catch(e){error=e;if(n<3)await new Promise(r=>setTimeout(r,1000*(n+1)));}}throw error;}
let query=client.from('projects').select('id,name,bookkit_slug').not('bookkit_slug','is',null);
if(process.argv[3])query=query.eq('bookkit_slug',process.argv[3]);
const projects=await must(query);
for(const project of projects){
 if(!/^(dubois|matthis)\/[a-z0-9-]+$/.test(project.bookkit_slug))continue;
 const dir=join(root,project.bookkit_slug),files=await walk(dir);
 const docs=await must(client.from('bookkit_documents').select('path,unix_mode').eq('project_id',project.id));
 const docMap=new Map(docs.map(d=>[d.path,d]));
 const existing=await must(client.from('bookkit_assets').select('path,sha256').eq('project_id',project.id));
 const assetMap=new Map(existing.map(d=>[d.path,d]));
 let verified=0,bytes=0;
 for(const file of files){
  const path=relative(dir,file),info=await stat(file),mode=info.mode;
  if(docMap.has(path)){
   if(docMap.get(path).unix_mode!==mode)await must(client.from('bookkit_documents').update({unix_mode:mode}).eq('project_id',project.id).eq('path',path));
   continue;
  }
  const handle=await open(file,'r'),chunks=[],hash=createHash('sha256');
  try{
   for(let offset=0;offset<info.size;offset+=CHUNK_SIZE){
    const buffer=Buffer.alloc(Math.min(CHUNK_SIZE,info.size-offset));let filled=0;
    while(filled<buffer.length){const {bytesRead}=await handle.read(buffer,filled,buffer.length-filled,offset+filled);if(!bytesRead)throw new Error('File changed while reading: '+path);filled+=bytesRead;}
    hash.update(buffer);const chunkHash=sha(buffer),key=project.id+'/'+chunkHash;
    if(!assetMap.has(path)){
     await retry(async()=>{
      const upload=await bucket.upload(key,buffer,{contentType:'application/octet-stream',upsert:false});
      if(upload.error&&!['409','Duplicate'].includes(String(upload.error.statusCode))&&!/already exists/i.test(upload.error.message))throw upload.error;
      const downloaded=await must(bucket.download(key));
      if(sha(Buffer.from(await downloaded.arrayBuffer()))!==chunkHash)throw new Error('Remote chunk checksum mismatch: '+path);
     });
    }
    chunks.push({sha256:chunkHash,size:buffer.length});bytes+=buffer.length;
    if(!assetMap.has(path)&&info.size>CHUNK_SIZE)console.log(JSON.stringify({book:project.bookkit_slug,path,verifiedMiB:Math.round((offset+buffer.length)/1024**2),totalMiB:Math.round(info.size/1024**2)}));
   }
  }finally{await handle.close();}
  const digest=hash.digest('hex');
  if(assetMap.has(path)){
   if(assetMap.get(path).sha256!==digest)throw new Error('Source differs from existing asset; refusing overwrite: '+path);
  }else{
   const after=await stat(file);if(after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw new Error('Source changed during import: '+path);
   await must(client.from('bookkit_assets').insert({project_id:project.id,path,size_bytes:info.size,sha256:digest,unix_mode:mode,chunks}));
  }
  verified++;
 }
 console.log(JSON.stringify({book:project.bookkit_slug,verifiedAssets:verified,bytes,storedTextDocuments:docs.length}));
}
