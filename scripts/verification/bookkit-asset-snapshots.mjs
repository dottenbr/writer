import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options),client=createClient(process.env.SUPABASE_URL,key,options);
const must=async q=>{const {data,error}=await q;if(error)throw error;return data;};
let uid,pid;const keys=[];
try{
 const email='snapshot-assets-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
 const {user}=await must(admin.auth.admin.createUser({email,password,email_confirm:true}));uid=user.id;await must(client.auth.signInWithPassword({email,password}));
 const project=await must(client.from('projects').insert({owner_id:uid,name:'Asset snapshot fixture',bookkit_slug:'test/'+randomUUID(),bookkit_import_complete:true}).select('id').single());pid=project.id;
 const manifests=[];
 for(const content of ['first attachment','changed attachment']){const bytes=Buffer.from(content),sha256=createHash('sha256').update(bytes).digest('hex'),key=pid+'/'+sha256;keys.push(key);await must(client.storage.from('bookkit-assets').upload(key,bytes));manifests.push({project_id:pid,path:'cover.bin',size_bytes:bytes.length,sha256,unix_mode:0o100640,chunks:[{sha256,size:bytes.length}]});}
 await must(client.from('bookkit_assets').insert(manifests[0]));
 await must(client.from('bookkit_assets').insert({project_id:pid,path:'empty/',size_bytes:0,sha256:createHash('sha256').digest('hex'),chunks:[],unix_mode:0o40750,is_directory:true}));
 await must(client.from('bookkit_documents').insert({project_id:pid,path:'bible/canon.md',content:'Unchanged text',source_sha256:'fixture',unix_mode:0o100640}));
 const baseline=await must(client.rpc('capture_bookkit_snapshot',{p_project_id:pid,p_message:'Files baseline'}));
 await must(client.from('bookkit_assets').update({...manifests[1],unix_mode:0o100644}).eq('project_id',pid).eq('path','cover.bin'));
 await must(client.from('bookkit_assets').delete().eq('project_id',pid).eq('path','empty/'));
 await must(client.from('bookkit_documents').update({unix_mode:0o100644}).eq('project_id',pid));
 await must(client.from('projects').update({bookkit_import_complete:false}).eq('id',pid));
 const diff=await must(client.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:baseline}));assert.equal(diff.length,3);assert.ok(diff.find(d=>d.path==='bible/canon.md').before_text.includes('permissions'));assert.equal(diff.find(d=>d.path==='empty/').after_text,null);
 // Owner cannot remove a chunk that is retained solely by a snapshot.
 await client.storage.from('bookkit-assets').remove([keys[0]]);assert.ok((await client.storage.from('bookkit-assets').download(keys[0])).data);
 assert.ok((await client.from('bookkit_snapshot_assets').update({manifest:{}}).eq('snapshot_id',baseline)).error);
 const safety=await must(client.rpc('restore_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:baseline}));
 assert.deepEqual(await must(client.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:baseline})),[]);
 assert.equal((await must(client.from('bookkit_assets').select('sha256,unix_mode').eq('project_id',pid).eq('path','cover.bin').single())).sha256,manifests[0].sha256);
 assert.equal((await must(client.from('bookkit_documents').select('unix_mode').eq('project_id',pid).single())).unix_mode,0o100640);
 assert.equal((await must(client.from('projects').select('bookkit_import_complete').eq('id',pid).single())).bookkit_import_complete,true);
 await must(client.rpc('restore_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:safety}));assert.deepEqual(await must(client.rpc('diff_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:safety})),[]);
 // Simulate the shape of a historical text-only snapshot; it must retain today's assets and modes.
 await must(admin.from('bookkit_snapshots').update({asset_count:null,import_complete:null}).eq('snapshot_id',baseline));await must(admin.from('bookkit_snapshot_files').update({unix_mode:null}).eq('snapshot_id',baseline));
 await must(client.rpc('restore_bookkit_snapshot',{p_project_id:pid,p_snapshot_id:baseline}));
 assert.equal((await must(client.from('bookkit_assets').select('sha256').eq('project_id',pid).single())).sha256,manifests[1].sha256);
 assert.equal((await must(client.from('bookkit_documents').select('unix_mode').eq('project_id',pid).single())).unix_mode,0o100644);
 console.log('PASS: attachment/empty-directory restore, permissions, safety undo, export readiness, protected chunks and historical snapshot compatibility');
}finally{
 if(keys.length)await must(admin.storage.from('bookkit-assets').remove(keys));if(pid)await must(admin.from('projects').delete().eq('id',pid));if(uid)await must(admin.auth.admin.deleteUser(uid));console.log('Temporary asset snapshot records removed');
}
