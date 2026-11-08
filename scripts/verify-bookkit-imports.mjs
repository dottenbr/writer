import {createClient} from '@supabase/supabase-js';import {readdir,stat} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {createHash} from 'node:crypto';import {join,relative,resolve} from 'node:path';
const root=resolve(process.argv[2]);const c=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});const must=async q=>{const {data,error}=await q;if(error)throw error;return data;};
async function walk(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','.DS_Store','__pycache__','node_modules'].includes(e.name)||e.name.endsWith('.pyc'))continue;if(e.isSymbolicLink())throw new Error('Unexpected symlink');if(e.isDirectory())result.push(...await walk(join(dir,e.name)));else if(e.isFile())result.push(join(dir,e.name));}return result;}
async function digest(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
for(const p of await must(c.from('projects').select('id,name,bookkit_slug').not('bookkit_slug','is',null))){
 if(!/^(dubois|matthis)\/[a-z0-9-]+$/.test(p.bookkit_slug))continue;
 const docs=await must(c.from('bookkit_documents').select('path,source_sha256,unix_mode').eq('project_id',p.id));const assets=await must(c.from('bookkit_assets').select('path,sha256,size_bytes,unix_mode').eq('project_id',p.id));
 const map=new Map([...docs.map(d=>[d.path,{...d,sha256:d.source_sha256}]),...assets.map(a=>[a.path,a])]);const dir=join(root,p.bookkit_slug),files=await walk(dir);let missing=0;
 for(const file of files){const entry=map.get(relative(dir,file));if(!entry){missing++;continue;}const info=await stat(file);if(entry.sha256!==await digest(file)||entry.unix_mode!==info.mode||('size_bytes'in entry&&entry.size_bytes!==info.size))throw new Error('Import differs from source: '+file);}
 if(missing){console.log(JSON.stringify({book:p.bookkit_slug,missing,complete:false}));continue;}
 await must(c.from('projects').update({bookkit_import_complete:true}).eq('id',p.id));console.log(JSON.stringify({book:p.bookkit_slug,verifiedFiles:files.length,complete:true}));
}
