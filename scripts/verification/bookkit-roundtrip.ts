import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {ZipWriter,ZipReader,BlobWriter,BlobReader,Uint8ArrayReader,Uint8ArrayWriter} from '@zip.js/zip.js';
import {importBookkitZip} from '../../src/lib/bookkit-import';
import {archiveManifest,writeBookkitArchive} from '../../src/lib/bookkit-archive';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)![1];
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,options);
const client=createClient(process.env.SUPABASE_URL!,key,options);
const must=async(q:any)=>{const {data,error}=await q;if(error)throw error;return data;};
let userId:string|undefined;const projects:string[]=[];
async function inventory(blob:Blob){const r=new ZipReader(new BlobReader(blob),{useWebWorkers:false});try{return await Promise.all((await r.getEntries()).map(async e=>({path:e.filename,mode:e.unixMode,directory:e.directory,bytes:e.directory?new Uint8Array():await e.getData(new Uint8ArrayWriter(),{checkSignature:true})})));}finally{await r.close();}}
async function roundtrip(blob:Blob,label:string){
 const project=await importBookkitZip(client,blob);assert.ok(project);projects.push(project);
 const files=await archiveManifest(client,project);const parts:Uint8Array[]=[];
 await writeBookkitArchive(client,project,files,new WritableStream({write(b){parts.push(b);}}));
 const before=await inventory(blob),after=await inventory(new Blob(parts as BlobPart[]));
 assert.equal(before.length,after.length);
 for(const file of before){const result=after.find(f=>f.path===file.path);assert.ok(result,file.path);assert.equal(result.mode,file.mode,file.path+' mode');assert.equal(result.directory,file.directory,file.path+' directory');assert.deepEqual(result.bytes,file.bytes,file.path+' bytes');}
 console.log(label+': '+before.length+' paths, bytes and Unix modes preserved');return project;
}
try{
 const email='writer-roundtrip-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
 const {user}=await must(admin.auth.admin.createUser({email,password,email_confirm:true}));userId=user.id;
 await must(client.auth.signInWithPassword({email,password}));
 const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false});
 const text=(s:string)=>new Uint8ArrayReader(new TextEncoder().encode(s));
 await writer.add('book.yaml',text('title: Archive verification\nauthor: Fixture\nmanuscript:\n  dir: manuscript\n  draft: draft\n  layout: parts\n'),{unixMode:0o100644});
 await writer.add('manuscript/01-part/01-one.md',text('---\nchapter: 1\ntitle: One\npart: 1\nstatus: drafting\n---\n# One\nHuman fixture.\n'),{unixMode:0o100644});
 await writer.add('draft/01-part/01-one.md',text('---\nchapter: 1\ntitle: One\npart: 1\nstatus: drafted\n---\n# One\nReference fixture.\n'),{unixMode:0o100644});
 await writer.add('bible/canon.md',text('\uFEFF---\nformat: preserved\n---\n\r\nFixture\r\n'),{unixMode:0o100640});
 await writer.add('bin/book',text('#!/bin/sh\nexit 0\n'),{unixMode:0o100755});
 await writer.add('research/big.bin',new Uint8ArrayReader(randomBytes(8*1024*1024+101)),{unixMode:0o100644});
 await writer.add('empty/',null,{directory:true,unixMode:0o40750});
 await writer.add('empty.md',text(''),{unixMode:0o100644});
 const project=await roundtrip(await writer.close(),'Chunked fixture');
 const large=await must(client.from('bookkit_assets').select('chunks').eq('project_id',project).eq('path','research/big.bin').single());assert.equal(large.chunks.length,2);
 const fixtureCount=(await must(client.from('projects').select('id'))).length;
 const invalid=new ZipWriter(new BlobWriter(),{useWebWorkers:false});await invalid.add('book.yaml',text('title: Invalid\nmanuscript:\n  dir: manuscript\npublication:\n  front_matter: [missing.md]\n'));
 const invalidBlob=await invalid.close();await assert.rejects(importBookkitZip(client,invalidBlob),/Missing publication matter/);
 assert.equal((await must(client.from('projects').select('id'))).length,fixtureCount);
 const originalUpload=client.storage.from.bind(client.storage);let uploadCalled=false;
 client.storage.from=((bucket:string)=>{const b=originalUpload(bucket);b.upload=(async()=>{uploadCalled=true;return {data:null,error:new Error('Injected upload failure')};}) as typeof b.upload;return b;}) as typeof client.storage.from;
 const failing=new ZipWriter(new BlobWriter(),{useWebWorkers:false});await failing.add('book.yaml',text('title: Rollback fixture\nmanuscript:\n  dir: manuscript\n'));await failing.add('asset.bin',text('asset'));
 await assert.rejects(importBookkitZip(client,await failing.close()),/Injected upload failure/);assert.ok(uploadCalled);client.storage.from=originalUpload;
 assert.equal((await must(client.from('projects').select('id'))).length,fixtureCount,'failed import should remove project');
 console.log('Invalid book rejection and failed-upload rollback passed');
 if(process.argv[2])await roundtrip(new Blob([await readFile(process.argv[2])]),'Sarre source archive');
}finally{
 for(const project of projects){const assets=await must(admin.from('bookkit_assets').select('chunks').eq('project_id',project));const keys=[...new Set<string>(assets.flatMap((a:any)=>a.chunks.map((c:any)=>project+'/'+c.sha256)))];if(keys.length)await must(admin.storage.from('bookkit-assets').remove(keys));await must(admin.from('projects').delete().eq('id',project));}
 if(userId)await must(admin.auth.admin.deleteUser(userId));console.log('Temporary roundtrip records removed');
}
