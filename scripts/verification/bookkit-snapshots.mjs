import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options);
const must=async q=>{const {data,error}=await q;if(error)throw error;return data;};
const users=[],projects=[],clients={};
try {
 for(const role of ['owner','editor','viewer','stranger']) {
  const password=randomUUID()+randomUUID(),email=`snapshot-${role}-${randomUUID()}@example.invalid`;
  const {user}=await must(admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(user.id);
  const client=createClient(process.env.SUPABASE_URL,key,options);await must(client.auth.signInWithPassword({email,password}));clients[role]={client,user};
 }
 const owner=clients.owner.client;
 for(let i=0;i<2;i++)projects.push(await must(owner.from('projects').insert({owner_id:clients.owner.user.id,name:'Temporary snapshot verification',bookkit_slug:'test-'+randomUUID()}).select('id').single()));
 const pid=projects[0].id;
 for(const role of ['editor','viewer'])await must(admin.from('project_members').insert({project_id:pid,user_id:clients[role].user.id,role,accepted_at:new Date().toISOString()}));
 const files=Array.from({length:55},(_,i)=>({project_id:pid,path:`outline/scenes/${String(i).padStart(2,'0')}-test.md`,content:`---\nchecked: 2026-11-08\n---\n\nScene card ${i}\n`,source_sha256:'fixture'}));
 files.push({project_id:pid,path:'manuscript/01-part/01-test.md',content:'---\nchapter: 1\nstatus: drafting\n---\n\n# Chapter 1\n\nHuman text.\n',source_sha256:'fixture'});
 files.push({project_id:pid,path:'research/empty.txt',content:'',source_sha256:'fixture'});
 await must(owner.from('bookkit_documents').insert(files));
 const snap=await must(owner.rpc('capture_bookkit_snapshot',{p_project_id:pid,p_message:'baseline'}));
 const duplicate=await must(owner.rpc('capture_bookkit_snapshot',{p_project_id:pid,p_message:'same content'}));
 assert.equal((await must(admin.from('bookkit_revisions').select('id').eq('project_id',pid))).length,files.length,'unchanged content is deduplicated');
 assert.deepEqual(await must(owner.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap,p_other_id:duplicate})),[]);
 const old=await must(owner.from('bookkit_documents').select('version').eq('project_id',pid).eq('path',files[0].path).single());
 await must(owner.from('bookkit_documents').delete().eq('project_id',pid));
 await must(owner.from('bookkit_documents').insert({project_id:pid,path:'bible/new.md',content:'Added after snapshot',source_sha256:'fixture'}));
 const firstPage=await must(owner.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap}));
 const nextPage=await must(owner.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap,p_offset:50}));assert.equal(firstPage.length+nextPage.length,58);
 assert.ok([...firstPage,...nextPage].some(d=>d.path==='research/empty.txt' && d.before_text==='' && d.after_text===null));
 for(const role of ['editor','viewer','stranger'])assert.ok((await clients[role].client.rpc('restore_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap})).error);
 assert.ok((await owner.rpc('restore_bookkit_snapshot',{p_project_id:projects[1].id,p_snapshot_id:snap})).error);
 assert.ok((await clients.stranger.client.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap})).error);
 const safety=await must(clients.owner.client.rpc('restore_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap}));
 const restored=await must(owner.from('bookkit_documents').select('path,content,source_sha256,version').eq('project_id',pid).order('path'));
 assert.deepEqual(restored.map(({version,...r})=>r),files.map(({project_id,...r})=>r).sort((a,b)=>a.path.localeCompare(b.path)));
 assert.ok(restored.find(r=>r.path===files[0].path).version>old.version,'restore cannot reuse stale versions');
 assert.equal((await must(owner.from('bookkit_documents').update({content:'stale'}).eq('project_id',pid).eq('path',files[0].path).eq('version',old.version).select('path'))).length,0);
 assert.deepEqual(await must(owner.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:snap})),[]);
 await must(owner.rpc('restore_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:safety}));
 assert.deepEqual((await must(owner.from('bookkit_documents').select('path,content').eq('project_id',pid))),[{path:'bible/new.md',content:'Added after snapshot'}]);
 // Snapshot manifests must not be forgeable or writable directly by members.
 assert.ok((await owner.from('bookkit_snapshot_files').insert({snapshot_id:snap,revision_id:randomUUID()})).error);
 console.log('PASS: exact file restore, additions/deletions, 50-row pagination, deduplication, safety undo, monotonic versions, access controls and cross-project isolation');
}finally {
 for(const p of projects)await must(admin.from('projects').delete().eq('id',p.id));
 for(const id of users)await must(admin.auth.admin.deleteUser(id));
 console.log('Temporary records removed');
}
