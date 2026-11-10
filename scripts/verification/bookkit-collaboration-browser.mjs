import {chromium} from '/Users/dominik/.agents/skills/playwright-browser/node_modules/playwright/index.mjs';
import {createClient} from '@supabase/supabase-js';import {readFile} from 'node:fs/promises';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
const key=(await readFile('.env.local','utf8')).match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1],opts={auth:{persistSession:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,opts),must=async q=>{const {data,error}=await q;if(error)throw error;return data;};
const users=[],clients={},accounts={};let pid,browser;const base='First paragraph.\n\nThe fact is blue.\n\nLast paragraph.\n';
async function waitFor(fn,label,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+label);}
async function open(role){const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();await page.goto('https://bookkit.net');await page.locator('input[type=email]').fill(accounts[role].email);await page.locator('input[type=password]').fill(accounts[role].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Book files',exact:true}).waitFor();await page.getByRole('button',{name:'Book files',exact:true}).click();await page.getByRole('button',{name:'bible/canon.md',exact:true}).click();await page.getByLabel('Book document').waitFor();await page.getByText('Live updates connected',{exact:false}).waitFor({timeout:15000});return page;}
try{
 for(const role of ['owner','editor','viewer','stranger']){const email='writer-live-'+role+'-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();const {user}=await must(admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Test '+role}}));users.push(user.id);accounts[role]={email,password,id:user.id};clients[role]=createClient(process.env.SUPABASE_URL,key,opts);await must(clients[role].auth.signInWithPassword({email,password}));}
 const p=await must(admin.from('projects').insert({name:'Live review verification',owner_id:accounts.owner.id,bookkit_slug:'test/'+randomUUID(),bookkit_import_complete:true}).select('id').single());pid=p.id;
 for(const role of ['owner','editor','viewer'])await must(admin.from('project_members').insert({project_id:pid,user_id:accounts[role].id,role,accepted_at:new Date().toISOString()}));
 await must(admin.from('project_settings').insert({project_id:pid}));await must(admin.from('llm_settings').insert({project_id:pid}));await must(admin.from('export_configs').insert({project_id:pid}));
 await must(admin.from('bookkit_documents').insert([{project_id:pid,path:'book.yaml',content:'title: Live review verification\nmanuscript:\n  dir: manuscript\n',source_sha256:'fixture'},{project_id:pid,path:'bible/canon.md',content:base,source_sha256:'fixture'}]));
 await must(admin.from('bookkit_assets').insert({project_id:pid,path:'research/attachment.bin',size_bytes:0,sha256:createHash('sha256').digest('hex'),chunks:[],unix_mode:33188}));
 browser=await chromium.launch({headless:true});const [author,editor]=await Promise.all([open('owner'),open('editor')]);
 const authored=base+'Owner addition.\n';await author.getByLabel('Book document').fill(authored);
 await waitFor(()=>editor.getByLabel('Book document').inputValue().then(v=>v===authored),'live author autosave');
 console.log('PASS: author autosave reaches editor live');
 const proposed=authored.replace('blue','green');await editor.getByLabel('Book document').fill(proposed);
 await author.getByText('Tracked suggestions (1)',{exact:true}).waitFor({timeout:10000});
 assert.equal((await must(admin.from('bookkit_documents').select('content').eq('project_id',pid).eq('path','bible/canon.md').single())).content,authored);
 await author.getByText('Review tracked changes',{exact:true}).click();assert.ok(await author.locator('.tracked-diff ins').count());assert.ok(await author.locator('.tracked-diff del').count());
 console.log('PASS: editor autosave is tracked and leaves canonical text untouched');
 await author.getByLabel('New comment').fill('Can we verify the changed fact?');await author.getByRole('button',{name:'Post comment',exact:true}).click();await editor.getByText('Can we verify the changed fact?',{exact:true}).waitFor({timeout:10000});
 await editor.getByPlaceholder('Reply to this conversation').fill('Yes, the source supports it.');await editor.getByRole('button',{name:'Reply',exact:true}).click();await author.getByText('Yes, the source supports it.',{exact:true}).waitFor({timeout:10000});
 await author.getByRole('button',{name:'Resolve thread',exact:true}).click();await waitFor(()=>editor.getByText('Comment threads (0 open)',{exact:true}).count().then(Boolean),'live thread resolution');
 await author.getByLabel('Show resolved threads').check();await author.getByRole('button',{name:'Reopen thread',exact:true}).click();await editor.getByText('Can we verify the changed fact?',{exact:true}).waitFor({timeout:10000});
 console.log('PASS: conversations, replies, resolve and reopen propagate live');
 await author.getByRole('button',{name:'Accept suggestion',exact:true}).click();await waitFor(()=>author.getByLabel('Book document').inputValue().then(v=>v===proposed),'accepted content');await waitFor(()=>editor.getByText('Tracked suggestions (0)',{exact:true}).count().then(Boolean),'accepted review live');
 await editor.getByLabel('Book document').fill(proposed.replace('green','red'));await author.getByRole('button',{name:'Reject suggestion',exact:true}).waitFor({timeout:10000});await author.getByRole('button',{name:'Reject suggestion',exact:true}).click();await waitFor(()=>editor.getByText('Tracked suggestions (0)',{exact:true}).count().then(Boolean),'rejected review live');assert.equal(await author.getByLabel('Book document').inputValue(),proposed);
 console.log('PASS: author accepts/rejects tracked suggestions');
 const other=await open('owner');await Promise.all([author.getByLabel('Book document').fill(proposed.replace('First paragraph.','First paragraph revised.')),other.getByLabel('Book document').fill(proposed.replace('Last paragraph.','Last paragraph revised.'))]);
 const merged=proposed.replace('First paragraph.','First paragraph revised.').replace('Last paragraph.','Last paragraph revised.');
 await waitFor(async()=>await author.getByLabel('Book document').inputValue()===merged&&await other.getByLabel('Book document').inputValue()===merged,'concurrent disjoint edits merged',15000);
 console.log('PASS: simultaneous non-overlapping edits merge in two author sessions');
 // A failed network write must survive closing/reloading the editor.
 await author.route('**/rest/v1/bookkit_documents*',route=>route.request().method()==='PATCH'?route.abort():route.continue());
 const recovered=merged+'Offline draft preserved.\n';await author.getByLabel('Book document').fill(recovered);
 await author.getByRole('alert').waitFor({timeout:10000});await author.unroute('**/rest/v1/bookkit_documents*');await author.reload();
 await author.getByRole('button',{name:'Book files',exact:true}).click();await author.getByRole('button',{name:'bible/canon.md',exact:true}).click();
 await waitFor(()=>author.getByLabel('Book document').inputValue().then(v=>v===recovered),'local draft recovered');
 await waitFor(async()=> (await must(admin.from('bookkit_documents').select('content').eq('project_id',pid).eq('path','bible/canon.md').single())).content===recovered,'recovered draft autosaved');
 console.log('PASS: failed save survives browser reload and autosaves after recovery');
 await waitFor(()=>other.getByLabel('Book document').inputValue().then(v=>v===recovered),'other session synchronized');
 await Promise.all([author.getByLabel('Book document').fill(recovered.replace('green','orange')),other.getByLabel('Book document').fill(recovered.replace('green','purple'))]);
 await waitFor(async()=>await author.getByRole('alert').count()>0||await other.getByRole('alert').count()>0,'overlapping edits report conflict');
 const serverText=(await must(admin.from('bookkit_documents').select('content').eq('project_id',pid).eq('path','bible/canon.md').single())).content;
 assert.ok(serverText.includes('orange')||serverText.includes('purple'));assert.ok((await author.getByLabel('Book document').inputValue()).includes('orange'));assert.ok((await other.getByLabel('Book document').inputValue()).includes('purple'));
 console.log('PASS: overlapping edits preserve both local drafts and report a conflict');
 const conflicted=await author.getByRole('alert').count()?author:other;
 await conflicted.getByRole('button',{name:'Compare with latest',exact:true}).click();await conflicted.getByRole('heading',{name:'Latest saved text',exact:true}).waitFor();
 conflicted.once('dialog',dialog=>dialog.accept());await conflicted.getByRole('button',{name:'Use latest saved text',exact:true}).click();
 await waitFor(()=>conflicted.getByLabel('Book document').inputValue().then(v=>v===serverText),'manual conflict resolution');
 console.log('PASS: author can compare and resolve an overlapping edit');
 // Continue in a clean owner page; preserve the conflicting drafts until test cleanup.
 const reviewer=await open('owner');await reviewer.getByRole('button',{name:'research/attachment.bin',exact:true}).click();await reviewer.getByRole('button',{name:'Download attachment',exact:true}).waitFor();
 await editor.getByRole('button',{name:'research/attachment.bin',exact:true}).click();await editor.getByRole('button',{name:'Download attachment',exact:true}).waitFor();await editor.getByLabel('New comment').fill('Attachment discussion.');await editor.getByRole('button',{name:'Post comment',exact:true}).click();await reviewer.getByText('Attachment discussion.',{exact:true}).waitFor({timeout:10000});
 const viewer=await open('viewer');assert.equal(await viewer.getByLabel('Book document').getAttribute('readonly'),'');await viewer.getByLabel('New comment').fill('Viewer conversation.');await viewer.getByRole('button',{name:'Post comment',exact:true}).click();
 console.log('PASS: attachment conversations and viewer comments');
 // Mock only the provider transport: test explicit AI-apply behavior without a real API key.
 await reviewer.getByRole('button',{name:'Manage',exact:true}).click();await reviewer.getByRole('button',{name:'Configure AI / LLM',exact:true}).click();await reviewer.getByPlaceholder('sk-ant-...').fill('sk-ant-ui-fixture');await reviewer.getByRole('button',{name:'Close',exact:true}).click();
 await reviewer.getByRole('button',{name:'Book files',exact:true}).click();await reviewer.getByRole('button',{name:'bible/canon.md',exact:true}).click();await reviewer.getByLabel('Book document').waitFor();
 let aiReply=serverText+'Proposed companion note.\n';
 await reviewer.route('**/api/ai',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:aiReply})}));
 await reviewer.getByLabel('AI review request').fill('Review this companion fixture.');await reviewer.getByRole('button',{name:'Propose companion update',exact:true}).click();await reviewer.getByRole('button',{name:'Apply companion proposal',exact:true}).waitFor();await reviewer.waitForTimeout(1200);
 assert.equal((await must(admin.from('bookkit_documents').select('content').eq('project_id',pid).eq('path','bible/canon.md').single())).content,serverText,'AI preview must not autosave');
 const changedDuringPreview=serverText+'Another author edit.\n';await must(clients.owner.from('bookkit_documents').update({content:changedDuringPreview}).eq('project_id',pid).eq('path','bible/canon.md'));
 await waitFor(()=>reviewer.getByLabel('Book document').inputValue().then(v=>v===changedDuringPreview),'external edit during AI preview');await reviewer.getByRole('button',{name:'Apply companion proposal',exact:true}).click();await reviewer.getByText('This file changed after the AI review.',{exact:false}).waitFor();
 aiReply=changedDuringPreview+'Approved companion fixture note.\n';await reviewer.getByRole('button',{name:'Propose companion update',exact:true}).click();await reviewer.getByText(aiReply.trim(),{exact:true}).waitFor();await reviewer.getByRole('button',{name:'Apply companion proposal',exact:true}).click();
 await waitFor(async()=> (await must(admin.from('bookkit_documents').select('content').eq('project_id',pid).eq('path','bible/canon.md').single())).content===aiReply,'explicit companion apply autosaved');
 console.log('PASS: mocked AI preview does not autosave, stale proposals are refused, explicit apply saves');
 for(const role of ['editor','viewer'])assert.equal((await must(clients[role].from('bookkit_documents').update({content:'bypass'}).eq('project_id',pid).eq('path','bible/canon.md').select('path'))).length,0);
 assert.equal((await must(clients.stranger.from('bookkit_threads').select('id').eq('project_id',pid))).length,0);
 const suggestion=(await must(admin.from('bookkit_suggestions').select('id,version').eq('project_id',pid)))[0];assert.ok((await clients.editor.rpc('decide_bookkit_suggestion',{p_suggestion_id:suggestion.id,p_decision:'accepted',p_expected_version:suggestion.version})).error);
 await author.screenshot({path:'/tmp/writer-live-collaboration.png',fullPage:true});console.log('PASS: API bypass, outsider reads and non-author decisions denied');
}finally{if(browser)await browser.close();if(pid)await must(admin.from('projects').delete().eq('id',pid));for(const id of users)await must(admin.auth.admin.deleteUser(id));console.log('Temporary browser accounts and project removed');}
