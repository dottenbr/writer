import {describe,it,expect} from 'vitest';
import {ZipReader,Uint8ArrayReader,Uint8ArrayWriter} from '@zip.js/zip.js';
import {writeBookkitArchive,validateArchiveFile,type ArchiveFile} from './bookkit-archive';
import type {SupabaseClient} from '@supabase/supabase-js';
describe('Bookkit ZIP',()=>{
 it('rejects traversal and inconsistent chunks',()=>{
  for(const path of ['../secret','/absolute','C:/file','a/../b','a\\b'])expect(()=>validateArchiveFile({path,size_bytes:0,unix_mode:33188})).toThrow();
  expect(()=>validateArchiveFile({path:'cover.png',size_bytes:10,unix_mode:33188,sha256:'0'.repeat(64),chunks:[]})).toThrow('Invalid asset chunks');
 });
 it('round-trips raw Markdown, an empty placeholder and executable mode',async()=>{
  const content='---\nchecked: 2026-11-08\n---\nA citation [@source].\n';
  const query:any={select(){return this},eq(){return this},async single(){return {data:{content},error:null}}};
  const client={from:()=>query} as unknown as SupabaseClient;
  const files:ArchiveFile[]=[{path:'bible/canon.md',size_bytes:new TextEncoder().encode(content).length,unix_mode:0o100644,revision_id:'fixture'},{path:'manuscript/.gitkeep',size_bytes:0,unix_mode:0o100644,sha256:'0'.repeat(64),chunks:[]},{path:'bin/check',size_bytes:new TextEncoder().encode(content).length,unix_mode:0o100755,revision_id:'fixture'}];
  const chunks:Uint8Array[]=[];await writeBookkitArchive(client,'fixture',files,new WritableStream({write(b){chunks.push(new Uint8Array(b));}}));
  const output=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){output.set(c,offset);offset+=c.length;}
  const reader=new ZipReader(new Uint8ArrayReader(output));const entries=await reader.getEntries();expect(entries.map(e=>e.filename)).toEqual(files.map(f=>f.path));
  for(const entry of entries){if(entry.directory)throw new Error('Unexpected directory entry');const data=await entry.getData!(new Uint8ArrayWriter());expect(new TextDecoder().decode(data)).toBe(entry.filename.endsWith('.gitkeep')?'':content);expect(entry.unixMode).toBe(entry.filename==='bin/check'?0o100755:0o100644);}
  await reader.close();
 });
});
