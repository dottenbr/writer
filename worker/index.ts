import { HUMAN_AUTHORSHIP_POLICY, AI_PROMPT_LIMIT } from '../src/lib/ai-policy';
interface Env { ASSETS:{fetch:(request:Request)=>Promise<Response>}; SUPABASE_URL:string; SUPABASE_PUBLISHABLE_KEY:string; SUPABASE_SECRET_KEY?:string; AI?:{run:(model:string,input:unknown,options?:unknown)=>Promise<any>}; EMAIL?:{send:(message:any)=>Promise<{messageId?:string}>} }
/** Models included with Bookkit through Cloudflare Workers AI. No user key needed. */
export const INCLUDED_MODELS=[
 {id:'@cf/moonshotai/kimi-k2.6',label:'Kimi K2.6 (included)'},
 {id:'@cf/zai-org/glm-5.3',label:'GLM 5.3 (included)'},
 {id:'@cf/deepseek-ai/deepseek-v4-pro-0813',label:'DeepSeek V4 Pro (included)'},
 {id:'@cf/openai/gpt-oss-120b',label:'gpt-oss 120B (included)'},
];
export const INCLUDED_PROMPT_LIMIT=90000;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function limitedBody(request:Request):Promise<any>{
 const reader=request.body?.getReader();if(!reader)throw new Error('Request body required.');const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>768000){await reader.cancel();throw new Error('Request too large. Select fewer context chapters.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
async function checkRequest(body:any,headers:Record<string,string>,env:Env,signal:AbortSignal,limit:number):Promise<Response|null>{
 if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>limit)return json({error:`Choose a smaller document or fewer context chapters (maximum ${limit.toLocaleString('en-US')} characters).`},400);
 if(!/^[a-f0-9-]{36}$/i.test(body.projectId??''))return json({error:'Open a book before requesting assistance.'},400);
 if(!['review','companion'].includes(body.mode))return json({error:'Only editorial reviews and companion updates are supported.'},400);
 if(body.mode==='companion'&&(!/^(bible|outline|craft)\/[^\\]+\.md$/.test(body.path??'')||(body.path as string).split('/').includes('..')))return json({error:'AI updates are limited to bible, outline and craft documents.'},400);
 const access=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/has_project_access',{method:'POST',headers,body:JSON.stringify({p_project_id:body.projectId,p_min_role:'editor'}),signal});
 if(!access.ok||await access.json()!==true)return json({error:'Editing access to this book is required.'},403);
 return null;
}
async function included(body:any,env:Env,headers:Record<string,string>,signal:AbortSignal):Promise<Response>{
 if(!env.AI)return json({error:'Included AI is not configured on this server.'},503);
 if(body.action==='models')return json({models:INCLUDED_MODELS});
 const model=INCLUDED_MODELS.find(m=>m.id===body.model)?.id??INCLUDED_MODELS[0].id;
 const rejected=await checkRequest(body,headers,env,signal,INCLUDED_PROMPT_LIMIT);if(rejected)return rejected;
 const policy=HUMAN_AUTHORSHIP_POLICY+(body.mode==='review'?' Return editorial observations only. Do not produce a replacement document.':' Return only the requested companion document. Do not turn narrative planning notes into manuscript prose.');
 const max=body.mode==='companion'?16384:4096;
 const data=await env.AI.run(model,{messages:[{role:'system',content:policy},{role:'user',content:body.prompt}],max_tokens:max});
 const choice=data?.choices?.[0];
 const reason=choice?.finish_reason;
 if(reason&&reason!=='stop')return json({error:'The model did not finish a complete response. No proposal was applied. Use a smaller document or narrower request.'},422);
 const raw=choice?.message?.content??data?.response??(Array.isArray(data?.output)?data.output.flatMap((o:any)=>o?.content??[]).filter((c:any)=>c?.type==='output_text').map((c:any)=>c.text).join('\n'):undefined);
 const text=typeof raw==='string'?raw.replace(/^\s*<think>[\s\S]*?<\/think>\s*/,''):'';
 if(!text.trim())return json({error:'The model returned no usable text.'},422);
 return json({text,model});
}

/**
 * A one-time sign-in link for an invited collaborator, for the owner to send
 * themselves. Nothing is emailed. Only the book's owner can create one, and
 * only for an email they have invited to that book.
 */
async function inviteLink(request:Request,env:Env,url:URL):Promise<Response>{
 if(request.method!=='POST')return json({error:'POST required'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
 if(!env.SUPABASE_SECRET_KEY)return json({error:'Invitation links are not configured on this server.'},503);
 const authorization=request.headers.get('Authorization')??'';if(!/^Bearer \S+$/.test(authorization))return json({error:'Sign in first.'},401);
 const signal=AbortSignal.timeout(20000);
 const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization,'Content-Type':'application/json'};
 const who=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers,signal});if(!who.ok)return json({error:'Your session expired. Sign in again.'},401);
 const user:any=await who.json();
 const body:any=await limitedBody(request).catch(()=>null);
 const projectId=String(body?.projectId??''),email=String(body?.email??'').trim().toLowerCase();
 if(!/^[a-f0-9-]{36}$/i.test(projectId)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254)return json({error:'A book and a valid email are required.'},400);
 const owned=await fetch(`${env.SUPABASE_URL}/rest/v1/projects?select=id&id=eq.${projectId}&owner_id=eq.${user.id}`,{headers,signal});
 if(!owned.ok||!(await owned.json()).length)return json({error:'Only the book’s owner can create invitation links.'},403);
 const invited=await fetch(`${env.SUPABASE_URL}/rest/v1/project_invitations?select=id&project_id=eq.${projectId}&email=eq.${encodeURIComponent(email)}`,{headers,signal});
 if(!invited.ok||!(await invited.json()).length)return json({error:'Invite this email to the book first.'},404);
 const admin={apikey:env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
 const generate=(type:string)=>fetch(env.SUPABASE_URL+'/auth/v1/admin/generate_link',{method:'POST',headers:admin,body:JSON.stringify({type,email,redirect_to:url.origin+'/'}),signal});
 let res=await generate('invite');
 if(!res.ok)res=await generate('magiclink');
 const data:any=await res.json().catch(()=>null);
 const link=data?.action_link??data?.properties?.action_link;
 if(!res.ok||typeof link!=='string')return json({error:'Could not create a sign-in link. Try again.'},502);
 if(body?.send!==true)return json({link});
 if(!env.EMAIL)return json({error:'Email sending is not configured on this server. Copy the link instead.',link},503);
 const book=await fetch(`${env.SUPABASE_URL}/rest/v1/projects?select=name&id=eq.${projectId}`,{headers,signal}).then(r=>r.json()).catch(()=>[]);
 const title=String(book?.[0]?.name??'a book').slice(0,200);
 const inviter=String(user?.user_metadata?.display_name||user?.email||'The author').slice(0,120);
 const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
 const sent=await env.EMAIL.send({
  to:email,
  from:{email:'invitations@bookkit.net',name:'Bookkit'},
  replyTo:user?.email,
  subject:`${inviter} invited you to “${title}” on Bookkit`,
  text:`${inviter} invited you to work on “${title}” in Bookkit.\n\nOpen this link to sign in (it works once and expires in 24 hours):\n${link}\n\nAfter signing in you can set a password from the account menu.\n\nIf you weren't expecting this, you can ignore this email.`,
  html:`<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1d1c1a"><p style="font-size:15px">${esc(inviter)} invited you to work on <strong>${esc(title)}</strong> in Bookkit.</p><p><a href="${esc(link)}" style="display:inline-block;background:#3b57c4;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open the book</a></p><p style="font-size:13px;color:#55514b">The link works once and expires in 24 hours. After signing in you can set a password from the account menu.</p><p style="font-size:12px;color:#8a857d">If you weren’t expecting this, you can ignore this email.</p></div>`,
 });
 return json({sent:true,messageId:sent?.messageId??null});
}

/**
 * "Email me a sign-in link" for existing accounts, sent by Bookkit. The
 * answer never reveals whether an account exists, no account is created, and
 * each account gets at most one link a minute.
 */
async function signInLink(request:Request,env:Env,url:URL):Promise<Response>{
 if(request.method!=='POST')return json({error:'POST required'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
 if(!env.SUPABASE_SECRET_KEY||!env.EMAIL)return json({error:'Email sign-in is not available. Use your password.'},503);
 const body:any=await limitedBody(request).catch(()=>null);
 const email=String(body?.email??'').trim().toLowerCase();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254)return json({error:'Enter a valid email.'},400);
 const done=json({ok:true});
 const signal=AbortSignal.timeout(20000);
 const admin={apikey:env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
 const found:any=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`,{headers:admin,signal}).then(r=>r.ok?r.json():[]).catch(()=>[]);
 const id=found?.[0]?.id;if(!id)return done;
 const user:any=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`,{headers:admin,signal}).then(r=>r.ok?r.json():null).catch(()=>null);
 if(!user)return done;
 const last=Number(user.app_metadata?.bookkit_link_sent_at??0);
 if(Date.now()-last<60000)return done;
 await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`,{method:'PUT',headers:admin,body:JSON.stringify({app_metadata:{...user.app_metadata,bookkit_link_sent_at:Date.now()}}),signal});
 const res=await fetch(env.SUPABASE_URL+'/auth/v1/admin/generate_link',{method:'POST',headers:admin,body:JSON.stringify({type:'magiclink',email,redirect_to:url.origin+'/'}),signal});
 const data:any=await res.json().catch(()=>null);
 const link=data?.action_link??data?.properties?.action_link;
 if(!res.ok||typeof link!=='string')return done;
 const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
 await env.EMAIL.send({
  to:email,
  from:{email:'sign-in@bookkit.net',name:'Bookkit'},
  subject:'Your Bookkit sign-in link',
  text:`Open this link to sign in to Bookkit (it works once and expires soon):\n${link}\n\nForgot your password? Sign in with this link, then choose Set password in the account menu.\n\nIf you didn't ask for this, you can ignore this email.`,
  html:`<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1d1c1a"><p style="font-size:15px">Here’s your sign-in link for Bookkit.</p><p><a href="${esc(link)}" style="display:inline-block;background:#3b57c4;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Sign in to Bookkit</a></p><p style="font-size:13px;color:#55514b">It works once and expires soon. Forgot your password? Sign in with this link, then choose <em>Set password</em> in the account menu.</p><p style="font-size:12px;color:#8a857d">If you didn’t ask for this, you can ignore this email.</p></div>`,
 }).catch(()=>null);
 return done;
}

export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(url.pathname==='/api/sign-in-link')return signInLink(request,env,url).catch(()=>json({ok:true}));
 if(url.pathname==='/api/invite-link')return inviteLink(request,env,url).catch(()=>json({error:'Could not create a sign-in link. Try again.'},502));
 if(url.pathname!=='/api/ai')return json({error:'Not found'},404);
 if(request.method!=='POST')return json({error:'POST required'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
 const authorization=request.headers.get('Authorization')??'';if(!/^Bearer \S+$/.test(authorization))return json({error:'Sign in to use editorial assistance.'},401);
 const signal=AbortSignal.timeout(90000);
 try{
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization,'Content-Type':'application/json'};
  const auth=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers,signal});if(!auth.ok)return json({error:'Your session expired. Sign in again.'},401);
  const body=await limitedBody(request);
  if(!['anthropic','openai','bookkit'].includes(body.provider)||!['models','complete'].includes(body.action))return json({error:'Unsupported AI operation.'},400);
  if(body.provider==='bookkit')return included(body,env,headers,signal);
  const key=request.headers.get('X-Provider-Key')??'';if(!key||key.length>512)return json({error:'Add your provider API key in API Settings.'},400);
  const providerHeaders:Record<string,string>=body.provider==='anthropic'?{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'}:{'Content-Type':'application/json',Authorization:'Bearer '+key};
  const base=body.provider==='anthropic'?'https://api.anthropic.com/v1':'https://api.openai.com/v1';
  let upstream:Response;
  if(body.action==='models')upstream=await fetch(base+'/models',{headers:providerHeaders,signal});
  else{
   if(typeof body.model!=='string'||!body.model||body.model.length>160)return json({error:'Choose an available model in API Settings.'},400);
   const rejected=await checkRequest(body,headers,env,signal,AI_PROMPT_LIMIT);if(rejected)return rejected;
   const policy=HUMAN_AUTHORSHIP_POLICY+(body.mode==='review'?' Return editorial observations only. Do not produce a replacement document.':' Return only the requested companion document. Do not turn narrative planning notes into manuscript prose.');
   const max=body.mode==='companion'?16384:4096;
   const payload=body.provider==='anthropic'?{model:body.model,max_tokens:max,system:policy,messages:[{role:'user',content:body.prompt}]}:{model:body.model,max_completion_tokens:max,messages:[{role:'system',content:policy},{role:'user',content:body.prompt}]};
   upstream=await fetch(base+(body.provider==='anthropic'?'/messages':'/chat/completions'),{method:'POST',headers:providerHeaders,body:JSON.stringify(payload),signal});
  }
  const data:any=await upstream.json().catch(()=>null);
  if(!upstream.ok){const message=String(data?.error?.message??'Provider request failed ('+upstream.status+').').replaceAll(key,'[redacted]');return json({error:message},upstream.status===429?429:502);}
  if(body.action==='models')return json({models:(Array.isArray(data?.data)?data.data:[]).filter((m:any)=>body.provider==='anthropic'||/^(gpt-|o[1-9]|chatgpt-)/.test(m.id)&&!/(audio|realtime|transcribe|tts|image|search|embedding)/.test(m.id)).map((m:any)=>({id:String(m.id),label:String(m.display_name??m.id)}))});
  const reason=body.provider==='anthropic'?data?.stop_reason:data?.choices?.[0]?.finish_reason;
  if(reason!==(body.provider==='anthropic'?'end_turn':'stop'))return json({error:'The provider did not finish a complete response. No proposal was applied. Use a smaller document or narrower request.'},422);
  const text=body.provider==='anthropic'?(data.content??[]).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n'):data.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim())return json({error:'The provider returned no usable text.'},422);
  return json({text});
 }catch(e){return json({error:e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'The provider timed out. Try a narrower request.':e instanceof SyntaxError?'Invalid request body.':'Unable to complete the request. Please try again.'},502);}
}};
