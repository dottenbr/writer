import { ZipWriter, TextReader } from '@zip.js/zip.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AssetChunk { sha256: string; size: number }
export interface ArchiveFile {directory?:boolean;path:string;size_bytes:number;unix_mode:number;revision_id?:string;sha256?:string;chunks?:AssetChunk[]}
export function validateArchiveFile(file:ArchiveFile):void {
 const path=file.directory?file.path.replace(/\/$/,''):file.path;
 if(!path||/[\u0000-\u001f]/.test(path)||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>p==='..'||p==='.'||!p)||/^[a-z]:/i.test(path))throw new Error('Unsafe archive path');
 if(!Number.isSafeInteger(file.size_bytes)||file.size_bytes<0)throw new Error('Invalid file size');
 if(file.chunks){
  if(!/^[a-f0-9]{64}$/.test(file.sha256??''))throw new Error('Invalid file checksum');
  if(file.chunks.some(c=>!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isSafeInteger(c.size)||c.size<1||c.size>16*1024*1024)||file.chunks.reduce((n,c)=>n+c.size,0)!==file.size_bytes)throw new Error('Invalid asset chunks');
 }
}
export async function archiveManifest(client:SupabaseClient,projectId:string):Promise<ArchiveFile[]> {
 const {data:manifest,error}=await client.rpc('bookkit_export_manifest',{p_project_id:projectId});if(error)throw error;
 if(!manifest)throw new Error('Book not found or access denied.');
 if(!manifest.complete)throw new Error('Book asset import is still in progress. Export will be available after all files are verified.');
 const files:ArchiveFile[]=manifest.files;
 const names=new Set<string>();for(const f of files){validateArchiveFile(f);if(names.has(f.path))throw new Error('Duplicate book path: '+f.path);names.add(f.path);}
 return files.sort((a,b)=>a.path.localeCompare(b.path));
}
async function digest(bytes:Uint8Array):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function writeBookkitArchive(client:SupabaseClient,projectId:string,files:ArchiveFile[],destination:WritableStream<Uint8Array>,progress?:(path:string,done:number,total:number)=>void):Promise<void>{
 const abort=new AbortController();
 const bridge=new TransformStream<Uint8Array,Uint8Array>();
 const transfer=bridge.readable.pipeTo(destination,{signal:abort.signal});
 void transfer.catch(()=>{});
 const writer=new ZipWriter(bridge.writable,{level:0,useWebWorkers:false,zip64:true});
 try{
  for(let index=0;index<files.length;index++){
   const f=files[index];validateArchiveFile(f);progress?.(f.path,index,files.length);
   if(f.directory){await writer.add(f.path,null,{directory:true,unixMode:f.unix_mode});}
   else if(f.revision_id){
    const {data,error}=await client.from('bookkit_revisions').select('content').eq('project_id',projectId).eq('id',f.revision_id).single();if(error)throw error;
    if(new TextEncoder().encode(data.content).length!==f.size_bytes)throw new Error('Text size mismatch: '+f.path);
    await writer.add(f.path,new TextReader(data.content),{unixMode:f.unix_mode});
   }else{
    let chunkIndex=0;
    const stream=new ReadableStream<Uint8Array>({async pull(controller){
     try{
      const c=f.chunks?.[chunkIndex++];if(!c){controller.close();return;}
      const {data,error}=await client.storage.from('bookkit-assets').download(projectId+'/'+c.sha256);if(error)throw error;
      const bytes=new Uint8Array(await data.arrayBuffer());if(bytes.length!==c.size||await digest(bytes)!==c.sha256)throw new Error('Asset checksum mismatch: '+f.path);
      controller.enqueue(bytes);
     }catch(e){controller.error(e);}
    }});
    await writer.add(f.path,stream,{unixMode:f.unix_mode});
   }
  }
  await writer.close();await transfer;progress?.('',files.length,files.length);
 }catch(error){abort.abort(error);await transfer.catch(()=>{});throw error;}
}
