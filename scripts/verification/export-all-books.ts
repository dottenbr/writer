import {createClient} from '@supabase/supabase-js';import {readFile,mkdir} from 'node:fs/promises';import {createWriteStream} from 'node:fs';import {Writable} from 'node:stream';import {execFileSync} from 'node:child_process';
import {archiveManifest,writeBookkitArchive} from '../../src/lib/bookkit-archive';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)![1];const client=createClient(process.env.SUPABASE_URL!,key,{auth:{persistSession:false}});
const must=async(q:any)=>{const {data,error}=await q;if(error)throw error;return data;};
await must(client.auth.signInWithPassword({email:process.env.WRITER_AUTHOR_EMAIL!,password:process.env.WRITER_AUTHOR_PASSWORD!}));
const projects=await must(client.from('projects').select('id,bookkit_slug').eq('bookkit_import_complete',true));await mkdir('/tmp/writer-verified-exports',{recursive:true});
for(const p of projects){if(!/^(dubois|matthis)\/[a-z0-9-]+$/.test(p.bookkit_slug)||process.argv[2]&&!p.bookkit_slug.includes(process.argv[2]))continue;
 const output='/tmp/writer-verified-exports/'+p.bookkit_slug.replace('/','-')+'.zip';const files=await archiveManifest(client,p.id);
 await writeBookkitArchive(client,p.id,files,Writable.toWeb(createWriteStream(output)) as WritableStream<Uint8Array>,(path,done,total)=>{if(done%100===0||done===total)console.log({book:p.bookkit_slug,done,total,path});});
 execFileSync('python3',['scripts/verification/compare-book-archive.py','/Users/dominik/Development/writing/thin-place-press/books/'+p.bookkit_slug,output],{stdio:'inherit'});
}
