import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options);
const clients={}, users=[];let project;let storageKey;
const must=async(query)=>{const {data,error}=await query;if(error)throw error;return data;};
try {
 for(const role of ['owner','editor','coauthor','viewer','stranger','unverified']) {
  const email=`writer-${role}-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
  const {user}=await must(admin.auth.admin.createUser({email,password,email_confirm:role!=='unverified'}));users.push(user.id);
  const client=createClient(process.env.SUPABASE_URL,key,options);
  if(role!=='unverified')await must(client.auth.signInWithPassword({email,password}));
  clients[role]={client,user,email};
 }
 project=await must(clients.owner.client.from('projects').insert({name:'Temporary collaboration verification',owner_id:clients.owner.user.id}).select('id').single());
 await must(admin.from('bookkit_documents').insert({project_id:project.id,path:'bible/test.md',content:'Fixture',source_sha256:'fixture'}));
 for(const role of ['editor','coauthor','viewer']) {
  const {client,email}=clients[role];
  await must(clients.owner.client.from('project_invitations').insert({project_id:project.id,email,role}));
  assert.equal((await must(client.from('bookkit_documents').select('path').eq('project_id',project.id))).length,0);
  assert.equal(await must(client.rpc('accept_project_invitations')),1);
  assert.equal(await must(client.rpc('accept_project_invitations')),0);
  assert.equal((await must(client.from('bookkit_documents').select('path').eq('project_id',project.id))).length,1);
  const changed=await must(client.from('bookkit_documents').update({content:role}).eq('project_id',project.id).eq('path','bible/test.md').select('version'));
  assert.equal(changed.length,0,'collaborators must propose changes for author review');
  const base=await must(client.from('bookkit_documents').select('revision_id').eq('project_id',project.id).single());
  const proposal=await client.rpc('save_bookkit_suggestion',{p_project_id:project.id,p_path:'bible/test.md',p_base_revision_id:base.revision_id,p_content:role});
  assert.equal(!!proposal.error,role==='viewer');
  const takeover=await client.from('projects').update({owner_id:clients[role].user.id}).eq('id',project.id).select('id');
  assert.ok(takeover.error || takeover.data.length===0,'role must not transfer ownership');
  const escalation=await client.from('project_members').update({role:'owner'}).eq('project_id',project.id).eq('user_id',clients[role].user.id).select('id');
  assert.ok(escalation.error || escalation.data.length===0,'role must not elevate membership');
  const invite=await client.from('project_invitations').insert({project_id:project.id,email:clients.stranger.email,role:'coauthor'});
  assert.ok(invite.error,'non-owner cannot invite');
  console.log(role+': acceptance, content permissions, ownership and invitation restrictions passed');
 }
 assert.equal((await must(clients.stranger.client.from('bookkit_documents').select('path').eq('project_id',project.id))).length,0);
 await must(clients.owner.client.from('project_invitations').insert({project_id:project.id,email:clients.unverified.email,role:'editor'}));
 const anon=createClient(process.env.SUPABASE_URL,key,options);
 const denied=await anon.rpc('accept_project_invitations');assert.ok(denied.error);
 // Stale version must not overwrite a collaborator's save.
 const doc=await must(clients.owner.client.from('bookkit_documents').select('version').eq('project_id',project.id).single());
 await must(clients.owner.client.from('bookkit_documents').update({content:'newer'}).eq('project_id',project.id));
 assert.equal((await must(clients.owner.client.from('bookkit_documents').update({content:'stale'}).eq('project_id',project.id).eq('version',doc.version).select('path'))).length,0);
 console.log('Stranger/anonymous access and stale-save protection passed');
 const bytes=Buffer.from('Private book asset fixture');const hash=createHash('sha256').update(bytes).digest('hex');storageKey=project.id+'/'+hash;
 await must(clients.owner.client.storage.from('bookkit-assets').upload(storageKey,bytes,{contentType:'application/octet-stream'}));
 for(const role of ['owner','editor','coauthor','viewer']) {
  const blob=await must(clients[role].client.storage.from('bookkit-assets').download(storageKey));assert.equal(Buffer.from(await blob.arrayBuffer()).toString(),bytes.toString());
 }
 assert.ok((await clients.stranger.client.storage.from('bookkit-assets').download(storageKey)).error);
 assert.ok((await anon.storage.from('bookkit-assets').download(storageKey)).error);
 assert.ok((await clients.viewer.client.storage.from('bookkit-assets').upload(project.id+'/denied',bytes)).error);
 assert.ok((await clients.stranger.client.storage.from('bookkit-assets').upload(project.id+'/denied',bytes)).error);
 assert.equal(await must(clients.stranger.client.rpc('bookkit_export_manifest',{p_project_id:project.id})),null);
 console.log('Private asset downloads, upload restrictions and export manifest isolation passed');
}finally{
 if(storageKey)await must(admin.storage.from('bookkit-assets').remove([storageKey]));
 if(project)await must(admin.from('projects').delete().eq('id',project.id));
 for(const id of users)await must(admin.auth.admin.deleteUser(id));
 console.log('Temporary verification records removed');
}
