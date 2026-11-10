import {createClient} from '@supabase/supabase-js';import {readFile,readdir,stat} from 'node:fs/promises';import {join,relative,resolve} from 'node:path';import {createHash} from 'node:crypto';import {parseBookkit} from '../src/lib/bookkit.ts';
const root=resolve(process.argv[2]);const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];const c=createClient(process.env.SUPABASE_URL,key,{auth:{persistSession:false}});const must=async q=>{const {data,error}=await q;if(error)throw error;return data;};await must(c.auth.signInWithPassword({email:process.env.WRITER_AUTHOR_EMAIL,password:process.env.WRITER_AUTHOR_PASSWORD}));
async function walk(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='__pycache__')continue;if(e.isDirectory())result.push(...await walk(join(dir,e.name)));else if(e.isFile()&&/\.(md|yaml|yml|json|bib|txt)$/.test(e.name))result.push(join(dir,e.name));}return result;}
for(const p of await must(c.from('projects').select('id,bookkit_slug').not('bookkit_slug','is',null))){
 const stored=await must(c.from('bookkit_documents').select('path,source_sha256,version,revision:bookkit_revisions!revision_id(content_hash)').eq('project_id',p.id));const map=new Map(stored.map(d=>[d.path,d]));
 const dir=join(root,p.bookkit_slug),files=await walk(dir),sources={},updates=[];
 for(const file of files){const path=relative(dir,file),content=await readFile(file,'utf8'),source_sha256=createHash('sha256').update(content).digest('hex');sources[path]=content;const old=map.get(path);if(old?.source_sha256===source_sha256)continue;if(old&&old.revision.content_hash!==old.source_sha256)throw new Error('Cloud/source conflict: '+p.bookkit_slug+'/'+path);updates.push({path,content,source_sha256,version:old?.version??null,unix_mode:(await stat(file)).mode});}
 parseBookkit(sources);
 if(updates.length){const n=await must(c.rpc('refresh_bookkit_sources',{p_project_id:p.id,p_files:updates}));console.log(p.bookkit_slug,': refreshed',n,'source files with safety snapshot');}
 else console.log(p.bookkit_slug,': source hashes unchanged');
}
