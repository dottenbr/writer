import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { parseBookkit } from '../src/lib/bookkit';
const root = resolve(process.argv[2] ?? '.');
const sql=postgres({host:process.env.SUPABASE_DB_HOST,user:'postgres',password:process.env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:'require',max:1,connect_timeout:10});
async function walk(dir:string):Promise<string[]> {
  const entries=await readdir(dir,{withFileTypes:true});
  return (await Promise.all(entries.filter(e=>!e.name.startsWith('.')).map(e=>e.isDirectory()?walk(join(dir,e.name)):Promise.resolve([join(dir,e.name)])))).flat();
}
try {
 const [owner]=await sql`select id from auth.users where email='dottenbr@me.com'`;
 if(!owner)throw new Error('Author account missing');
 const paths=await walk(root);
 for(const configPath of paths.filter(p=>p.endsWith('/book.yaml'))) {
  const dir=configPath.slice(0,-'/book.yaml'.length);
  const sources=paths.filter(p=>p.startsWith(dir+'/') && /\.(md|yaml|yml|json|bib|txt)$/.test(p));
  const files=Object.fromEntries(await Promise.all(sources.map(async p=>[relative(dir,p),await readFile(p,'utf8')])));
  const book=parseBookkit(files);
  const key=relative(root,dir);
  await sql.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(78210612)`;
   const [existing]=await tx`select id from public.projects where owner_id=${owner.id} and bookkit_slug=${key}`;
   if(existing){console.log('Already imported; preserving cloud edits:',key);return;}
   const [project]=await tx`insert into public.projects(owner_id,name,brief_title,bookkit_slug) values(${owner.id},${book.config.title},${book.config.title},${key}) returning id`;
   await tx`insert into public.project_members(project_id,user_id,role,accepted_at) values(${project.id},${owner.id},'owner',now())`;
   await tx`insert into public.project_settings(project_id) values(${project.id})`;
   await tx`insert into public.export_configs(project_id,author) values(${project.id},${book.config.author ?? ''})`;
   await tx`insert into public.llm_settings(project_id) values(${project.id})`;
   const docs=book.documents.map(d=>({project_id:project.id,path:d.path,content:d.raw,source_sha256:createHash('sha256').update(d.raw).digest('hex')}));
   for(let i=0;i<docs.length;i+=50)await tx`insert into public.bookkit_documents ${tx(docs.slice(i,i+50))}`;
   const stored=await tx`select path,content,source_sha256 from public.bookkit_documents where project_id=${project.id}`;
   if(stored.length!==docs.length || stored.some(d=>files[d.path]!==d.content || createHash('sha256').update(d.content).digest('hex')!==d.source_sha256))throw new Error('Import verification failed: '+key);
   console.log(JSON.stringify({book:key,projectId:project.id,verifiedDocuments:stored.length,referenceChapters:book.chapters.filter(c=>c.reference).length}));
  });
 }
}finally{await sql.end();}
