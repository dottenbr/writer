import { BlobReader, ZipReader, Uint8ArrayWriter, type Entry, type FileEntry } from '@zip.js/zip.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { parse } from 'yaml';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseBookkit } from './bookkit';
import { validateArchiveFile, type AssetChunk } from './bookkit-archive';
const hex=(b:Uint8Array)=>Array.from(b).map(v=>v.toString(16).padStart(2,'0')).join('');
const hash=(b:Uint8Array)=>hex(sha256(b));
const TEXT_LIMIT=16*1024*1024, CHUNK_SIZE=8*1024*1024;
const isText=(path:string)=>/\.(md|yaml|yml|json|bib|txt)$/i.test(path);
const skip=(path:string)=>path.split('/').some(p=>['.git','.DS_Store','__MACOSX','__pycache__','node_modules'].includes(p))||path.endsWith('.pyc');
export function normalizedBookEntries(entries:Entry[]):Array<{entry:Entry;path:string}>|null {
 if(entries.length>20000)throw new Error('Archive contains too many entries.');
 for(const e of entries){validateArchiveFile({path:e.filename,size_bytes:e.uncompressedSize,unix_mode:e.unixMode??0o100644,directory:e.directory});if(e.symlink)throw new Error('Symbolic links are not supported in book archives.');if(e.encrypted)throw new Error('Unlock the archive before importing.');}
 const useful=entries.filter(e=>!skip(e.filename));
 const configs=useful.filter(e=>!e.directory&&/(^|\/)book\.yaml$/.test(e.filename));
 if(!configs.length)return null;if(configs.length!==1)throw new Error('Import one book at a time. The archive contains multiple book.yaml files.');
 const prefix=configs[0].filename.slice(0,-'book.yaml'.length),seen=new Set<string>();
 const result=[];
 for(const entry of useful){
  if(entry.filename===prefix)continue;
  if(!entry.filename.startsWith(prefix))throw new Error('Archive contains files outside the book folder.');
  const path=entry.filename.slice(prefix.length);
  if(seen.has(path))throw new Error('Duplicate archive path: '+path);seen.add(path);result.push({entry,path});
 }
 for(const {entry,path} of result){const parts=path.replace(/\/$/,'').split('/');for(let i=1;i<parts.length;i++)if(seen.has(parts.slice(0,i).join('/')))throw new Error('File and folder paths collide: '+path);if(!entry.directory&&seen.has(path+'/'))throw new Error('File and folder paths collide: '+path);}
 return result;
}
async function readText(entry:FileEntry):Promise<string>{
 if(entry.uncompressedSize>TEXT_LIMIT)throw new Error('Book document is too large to edit: '+entry.filename);
 const bytes=await entry.getData(new Uint8ArrayWriter(),{checkSignature:true});
 return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
export async function importBookkitZip(client:SupabaseClient,blob:Blob,onProgress?:(message:string)=>void):Promise<string|null>{
 const zip=new ZipReader(new BlobReader(blob),{useWebWorkers:false});let projectId:string|null=null;
 const uploaded=new Set<string>();
 const must=async(q:any)=>{const {data,error}=await q;if(error)throw error;return data;};
 try{
  onProgress?.('Inspecting archive…');
  const files=normalizedBookEntries(await zip.getEntries());if(!files)return null;
  const configEntry=files.find(f=>f.path==='book.yaml')!.entry as FileEntry;
  const configRaw=await readText(configEntry),config=parse(configRaw);
  const roots=[config?.manuscript?.dir,config?.manuscript?.draft,'bible','outline','craft','frontmatter','backmatter'].filter((s):s is string=>typeof s==='string');
  const matter=new Set([...(config?.publication?.front_matter??[]),...(config?.publication?.back_matter??[])]);
  const core:Record<string,string>={'book.yaml':configRaw};
  for(const {entry,path} of files)if(!entry.directory&&path!=='book.yaml'&&isText(path)&&(roots.some(root=>path.startsWith(root+'/'))||matter.has(path)))core[path]=await readText(entry);
  const book=parseBookkit(core); // Do not create cloud state for an invalid book.
  const {data:userData,error:userError}=await client.auth.getUser();if(userError)throw userError;if(!userData.user)throw new Error('Sign in before importing.');
  const project=await must(client.from('projects').insert({owner_id:userData.user.id,name:book.config.title,brief_title:book.config.title,bookkit_slug:'import/'+crypto.randomUUID(),bookkit_import_complete:false}).select('id').single());projectId=project.id;
  await must(client.from('project_members').insert({project_id:projectId,user_id:userData.user.id,role:'owner',accepted_at:new Date().toISOString()}));
  await must(client.from('project_settings').insert({project_id:projectId}));await must(client.from('llm_settings').insert({project_id:projectId}));await must(client.from('export_configs').insert({project_id:projectId,author:book.config.author??''}));
  for(let index=0;index<files.length;index++){
   const {entry,path}=files[index],unix_mode=entry.unixMode??(entry.directory?0o40755:0o100644);onProgress?.(`Importing ${index+1}/${files.length}: ${path}`);
   if(!entry.directory&&isText(path)&&entry.uncompressedSize<=TEXT_LIMIT){
    const content=core[path]??await readText(entry),source_sha256=hash(new TextEncoder().encode(content));
    await must(client.from('bookkit_documents').insert({project_id:projectId,path,content,source_sha256,unix_mode}));
   }else{
    const chunks:AssetChunk[]=[],fileHash=sha256.create();let buffer=new Uint8Array(CHUNK_SIZE),used=0,total=0;
    const flush=async()=>{if(!used)return;const bytes=buffer.slice(0,used),digest=hash(bytes),key=projectId+'/'+digest;uploaded.add(key);
     const result=await client.storage.from('bookkit-assets').upload(key,bytes,{contentType:'application/octet-stream',upsert:false});
     if(result.error&&!/already exists|duplicate/i.test(result.error.message)&&String(result.error.statusCode)!=='409')throw result.error;
     const downloaded=await must(client.storage.from('bookkit-assets').download(key));if(hash(new Uint8Array(await downloaded.arrayBuffer()))!==digest)throw new Error('Uploaded checksum mismatch: '+path);
     chunks.push({sha256:digest,size:used});used=0;
    };
    if(!entry.directory)await entry.getData(new WritableStream<Uint8Array>({async write(bytes){fileHash.update(bytes);total+=bytes.length;if(total>entry.uncompressedSize)throw new Error('Archive size mismatch: '+path);let offset=0;while(offset<bytes.length){const n=Math.min(buffer.length-used,bytes.length-offset);buffer.set(bytes.subarray(offset,offset+n),used);used+=n;offset+=n;if(used===buffer.length)await flush();}},async close(){await flush();}}),{checkSignature:true});
    if(total!==entry.uncompressedSize)throw new Error('Incomplete archive file: '+path);
    await must(client.from('bookkit_assets').insert({project_id:projectId,path,size_bytes:total,sha256:hex(fileHash.digest()),unix_mode,chunks,is_directory:entry.directory}));
   }
  }
  await must(client.from('projects').update({bookkit_import_complete:true}).eq('id',projectId));
  onProgress?.('Book imported.');return projectId;
 }catch(error){
  if(projectId){
   let cleanupError:unknown;
   try{await must(client.from('bookkit_assets').delete().eq('project_id',projectId));}catch(e){cleanupError=e;}
   const keys=[...uploaded];for(let i=0;i<keys.length;i+=100){try{await must(client.storage.from('bookkit-assets').remove(keys.slice(i,i+100)));}catch(e){cleanupError=e;}}
   if(!cleanupError){try{await must(client.from('projects').delete().eq('id',projectId));}catch(e){cleanupError=e;}}
   if(cleanupError)throw new Error(`${(error as Error).message}. Incomplete import ${projectId} remains; contact the project owner to finish cleanup.`);
  }
  throw error;
 }finally{await zip.close();}
}
