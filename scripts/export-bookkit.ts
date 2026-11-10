import {createClient} from '@supabase/supabase-js';import {readFile} from 'node:fs/promises';import {createWriteStream} from 'node:fs';import {Writable} from 'node:stream';
import {archiveManifest,writeBookkitArchive} from '../src/lib/bookkit-archive';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)![1];
const c=createClient(process.env.SUPABASE_URL!,key,{auth:{persistSession:false}});
const {error}=await c.auth.signInWithPassword({email:process.env.WRITER_AUTHOR_EMAIL!,password:process.env.WRITER_AUTHOR_PASSWORD!});if(error)throw error;
const {data:project,error:pe}=await c.from('projects').select('id').eq('bookkit_slug',process.argv[2]).single();if(pe)throw pe;
const files=await archiveManifest(c,project.id);
await writeBookkitArchive(c,project.id,files,Writable.toWeb(createWriteStream(process.argv[3],{flags:'wx'})) as WritableStream<Uint8Array>,(path,done,total)=>{if(done%50===0||done===total)console.log({done,total,path});});
console.log('Export complete:',process.argv[3]);
