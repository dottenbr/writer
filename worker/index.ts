import { AI_PROMPT_LIMIT } from '../src/lib/ai-policy';
import { assistantPolicy, declaredPolicy } from '../src/lib/policy-blocks';
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

/** The book's own AI policy (book.yaml `ai_policy`), as the assistant's instructions for this request. */
async function bookPolicy(body:any,headers:Record<string,string>,env:Env,signal:AbortSignal):Promise<string>{
 const rows:any=await fetch(`${env.SUPABASE_URL}/rest/v1/bookkit_documents?select=content&project_id=eq.${body.projectId}&path=eq.book.yaml`,{headers,signal}).then(r=>r.ok?r.json():[]).catch(()=>[]);
 const base=assistantPolicy(declaredPolicy(String(rows?.[0]?.content??'')));
 return base+'\n\n'+(body.mode==='review'?'Return editorial observations only. Do not produce a replacement document.':'Return only the requested companion document. Do not turn narrative planning notes into manuscript prose.');
}
async function included(body:any,env:Env,headers:Record<string,string>,signal:AbortSignal):Promise<Response>{
 if(!env.AI)return json({error:'Included AI is not configured on this server.'},503);
 if(body.action==='models')return json({models:INCLUDED_MODELS});
 const model=INCLUDED_MODELS.find(m=>m.id===body.model)?.id??INCLUDED_MODELS[0].id;
 const rejected=await checkRequest(body,headers,env,signal,INCLUDED_PROMPT_LIMIT);if(rejected)return rejected;
 const policy=await bookPolicy(body,headers,env,signal);
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

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Show a code in two halves, "123 456", so it is easy to read and type. */
export const spacedCode=(code:string)=>code.length>=6&&code.length%2===0?code.slice(0,code.length/2)+' '+code.slice(code.length/2):code;

/** Bookkit's own sign-in codes: 6 digits, 15 minutes, 5 tries. */
export const CODE_MINUTES=15, CODE_TRIES=5;
const sha256=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const codeHash=(code:string,userId:string,secret:string)=>sha256(`${secret.slice(0,16)}:${userId}:${code}`);
function newCode():string{const n=crypto.getRandomValues(new Uint32Array(1))[0]%1000000;return String(n).padStart(6,'0');}
/** Store a fresh code for this account that unlocks the given Supabase token. */
async function issueCode(env:Env,userId:string,tokenHash:string,tokenType:'magiclink'|'invite',signal:AbortSignal):Promise<string>{
 const code=newCode();
 const admin={apikey:env.SUPABASE_SECRET_KEY!,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'};
 const res=await fetch(`${env.SUPABASE_URL}/rest/v1/bookkit_sign_in_codes?on_conflict=user_id`,{method:'POST',headers:admin,signal,body:JSON.stringify({user_id:userId,code_hash:await codeHash(code,userId,env.SUPABASE_SECRET_KEY!),token_hash:tokenHash,token_type:tokenType,expires_at:new Date(Date.now()+CODE_MINUTES*60000).toISOString(),attempts:0,created_at:new Date().toISOString()})});
 if(!res.ok)throw new Error('Could not store the sign-in code.');
 return code;
}
const signInUrl=(origin:string,email:string,code:string)=>`${origin}/sign-in?email=${encodeURIComponent(email)}&code=${code}`;
/**
 * A Bookkit-branded transactional email: wordmark, a short message, an
 * optional one-time code and an optional button. Always plain HTML tables
 * with inline styles (what mail clients render reliably) plus a plain-text
 * twin.
 */
export function bookkitEmail(o:{preheader:string;lines:string[];code?:string;codeLead?:string;codeNote?:string;button?:{label:string;url:string};footnote:string;origin:string}):{html:string;text:string}{
 const font="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
 const p=(t:string)=>`<p style="margin:0 0 14px;font:15px/1.55 ${font};color:#1d1c1a">${t}</p>`;
 const code=o.code?`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 10px"><tr><td style="background:#f4f2ee;border:1px solid #e7e4de;border-radius:10px;padding:14px 22px;font:600 30px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:6px;color:#1d1c1a">${esc(spacedCode(o.code))}</td></tr></table>`+(o.codeNote?`<p style="margin:0 0 18px;font:13px/1.5 ${font};color:#55514b">${o.codeNote}</p>`:''):'';
 const button=o.button?`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="background:#1d1c1a;border-radius:8px"><a href="${esc(o.button.url)}" style="display:inline-block;padding:11px 20px;font:600 14px ${font};color:#ffffff;text-decoration:none">${esc(o.button.label)}</a></td></tr></table>`:'';
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Bookkit</title></head><body style="margin:0;padding:0;background:#f6f5f2">`
  +`<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>`
  +`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2"><tr><td align="center" style="padding:32px 16px">`
  +`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">`
  +`<tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:30px;height:30px;background:#1d1c1a;border-radius:8px;text-align:center;vertical-align:middle;font:italic 700 20px/30px Georgia,'Times New Roman',serif;color:#ffffff">b</td><td style="padding-left:9px;font:600 18px ${font};color:#1d1c1a;letter-spacing:-0.2px">bookkit</td></tr></table></td></tr>`
  +`<tr><td style="background:#ffffff;border:1px solid #e7e4de;border-radius:14px;padding:28px 28px 14px">${o.lines.map(p).join('')}${button}${o.codeLead?p(o.codeLead):''}${code}</td></tr>`
  +`<tr><td style="padding:16px 4px 0;font:12px/1.5 ${font};color:#8a857d">${o.footnote}<br><a href="${esc(o.origin)}" style="color:#8a857d">${esc(new URL(o.origin).host)}</a> · Write your book.</td></tr>`
  +`</table></td></tr></table></body></html>`;
 const strip=(t:string)=>t.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
 const text=[...o.lines.map(strip),o.button?`${o.button.label}: ${o.button.url}`:'',o.codeLead?strip(o.codeLead):'',o.code?spacedCode(o.code):'',o.codeNote?strip(o.codeNote):'','—',strip(o.footnote),new URL(o.origin).host].filter(Boolean).join('\n\n');
 return {html,text};
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
 const projectId=String(body?.projectId??''),libraryId=String(body?.libraryId??''),email=String(body?.email??'').trim().toLowerCase();
 const forLibrary=/^[a-f0-9-]{36}$/i.test(libraryId);
 if((!forLibrary&&!/^[a-f0-9-]{36}$/i.test(projectId))||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254)return json({error:'A book or library and a valid email are required.'},400);
 let library:any=null;
 if(forLibrary){
  const role=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/library_role`,{method:'POST',headers,signal,body:JSON.stringify({p_library:libraryId})}).then(r=>r.ok?r.json():null).catch(()=>null);
  if(role!=='owner')return json({error:'Only the library’s owner can send invitations.'},403);
  library=(await fetch(`${env.SUPABASE_URL}/rest/v1/libraries?select=id,slug,name,owner_email&id=eq.${libraryId}`,{headers,signal}).then(r=>r.json()).catch(()=>[]))?.[0];
  const invited=await fetch(`${env.SUPABASE_URL}/rest/v1/library_invitations?select=id&library_id=eq.${libraryId}&email=eq.${encodeURIComponent(email)}`,{headers,signal}).then(r=>r.ok?r.json():[]).catch(()=>[]);
  if(!library||(!invited.length&&library.owner_email!==email))return json({error:'Add this email to the library first.'},404);
 }else{
  const owned=await fetch(`${env.SUPABASE_URL}/rest/v1/projects?select=id&id=eq.${projectId}&owner_id=eq.${user.id}`,{headers,signal});
  if(!owned.ok||!(await owned.json()).length)return json({error:'Only the book’s owner can create invitation links.'},403);
  const invited=await fetch(`${env.SUPABASE_URL}/rest/v1/project_invitations?select=id&project_id=eq.${projectId}&email=eq.${encodeURIComponent(email)}`,{headers,signal});
  if(!invited.ok||!(await invited.json()).length)return json({error:'Invite this email to the book first.'},404);
 }
 const admin={apikey:env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
 const generate=(type:string)=>fetch(env.SUPABASE_URL+'/auth/v1/admin/generate_link',{method:'POST',headers:admin,body:JSON.stringify({type,email,redirect_to:url.origin+'/'}),signal});
 let res=await generate('invite');
 if(!res.ok)res=await generate('magiclink');
 const data:any=await res.json().catch(()=>null);
 const link=data?.action_link??data?.properties?.action_link;
 if(!res.ok||typeof link!=='string')return json({error:'Could not create a sign-in link. Try again.'},502);
 if(body?.send!==true)return json({link});
 if(!env.EMAIL)return json({error:'Email sending is not configured on this server. Copy the link instead.',link},503);
 const book=forLibrary?[]:await fetch(`${env.SUPABASE_URL}/rest/v1/projects?select=name&id=eq.${projectId}`,{headers,signal}).then(r=>r.json()).catch(()=>[]);
 const title=String(forLibrary?library.name:book?.[0]?.name??'a book').slice(0,200);
 const home=forLibrary&&/\.bookkit\.net$/.test(url.hostname)?`https://${library.slug}.bookkit.net`:url.origin;
 const owning=forLibrary&&library.owner_email===email;
 const inviter=String(user?.user_metadata?.display_name||user?.email||'The author').slice(0,120);
 const tokenHash=data?.hashed_token??data?.properties?.hashed_token;
 const invitee=data?.id??data?.user?.id;
 const tokenType=(data?.verification_type??data?.properties?.verification_type)==='invite'?'invite':'magiclink';
 const code=typeof tokenHash==='string'&&typeof invitee==='string'?await issueCode(env,invitee,tokenHash,tokenType,signal).catch(()=>null):null;
 const hasCode=!!code;
 const mail=bookkitEmail({
  origin:url.origin,
  preheader:`${inviter} invited you to work on ${title}.`,
  lines:[owning?`<strong>${esc(inviter)}</strong> set up <strong>${esc(title)}</strong> for you on Bookkit: your own place for your books, at ${esc(home.replace(/^https?:\/\//,''))}.`:`<strong>${esc(inviter)}</strong> invited you to ${forLibrary?'join':'work on'} <strong>${esc(title)}</strong> in Bookkit.`],
  button:{label:forLibrary?'Open the library':'Open the book',url:hasCode?signInUrl(home,email,code!):link},
  codeLead:hasCode?`Or go to ${esc(home.replace(/^https?:\/\//,''))}, choose <em>I have a code</em>, and enter this email address with the code:`:undefined,
  code:hasCode?code!:undefined,
  codeNote:hasCode?`The button and the code work once and expire after ${CODE_MINUTES} minutes. If they expire, use <em>Email me a sign-in code</em> on the sign-in page.`:undefined,
  footnote:'You can set a password later from the account menu. If you weren’t expecting this invitation, you can ignore it.',
 });
 const sent=await env.EMAIL.send({
  to:email,
  from:{email:'invitations@bookkit.net',name:'Bookkit'},
  replyTo:user?.email,
  subject:owning?`${inviter} set up ${title} for you on Bookkit`:`${inviter} invited you to “${title}” on Bookkit`,
  text:mail.text,html:mail.html,
 });
 return json({sent:true,messageId:sent?.messageId??null});
}

/**
 * "Email me a sign-in code" for existing accounts, sent by Bookkit. The
 * answer never reveals whether an account exists, no account is created, and
 * each account gets at most one code a minute. The email has the 6-digit
 * code and a link that carries the same code.
 */
async function signInCode(request:Request,env:Env,url:URL):Promise<Response>{
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
 const tokenHash=data?.hashed_token??data?.properties?.hashed_token;
 if(!res.ok||typeof tokenHash!=='string')return done;
 const code=await issueCode(env,id,tokenHash,'magiclink',signal);
 const mail=bookkitEmail({
  origin:url.origin,
  preheader:`Your code is ${spacedCode(code)}. It expires in ${CODE_MINUTES} minutes.`,
  lines:['Here’s your code for signing in to Bookkit:'],
  code,
  codeNote:`Type it on the sign-in screen, or use the button below. It works once and expires in ${CODE_MINUTES} minutes.`,
  button:{label:'Sign in to Bookkit',url:signInUrl(url.origin,email,code)},
  footnote:'You’re getting this because someone asked to sign in to Bookkit with this email address. If it wasn’t you, ignore this email; nobody can sign in without the code. Forgot your password? After signing in, choose Set password in the account menu.',
 });
 await env.EMAIL.send({
  to:email,
  from:{email:'sign-in@bookkit.net',name:'Bookkit'},
  subject:`Your Bookkit code: ${spacedCode(code)}`,
  text:mail.text,html:mail.html,
 }).catch(()=>null);
 return done;
}

/**
 * Exchange a Bookkit sign-in code for a session. Wrong codes count against
 * the code (5 tries), and an expired or used code is gone.
 */
async function signInVerify(request:Request,env:Env,url:URL):Promise<Response>{
 if(request.method!=='POST')return json({error:'POST required'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
 if(!env.SUPABASE_SECRET_KEY)return json({error:'Code sign-in is not available. Use your password.'},503);
 const body:any=await limitedBody(request).catch(()=>null);
 const email=String(body?.email??'').trim().toLowerCase();
 const code=String(body?.code??'').replace(/\D/g,'');
 const wrong=json({error:'That code is wrong or has expired. Check the latest email, or send a new code.'},400);
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||code.length!==6)return wrong;
 const signal=AbortSignal.timeout(20000);
 const admin={apikey:env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
 const found:any=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`,{headers:admin,signal}).then(r=>r.ok?r.json():[]).catch(()=>[]);
 const id=found?.[0]?.id;if(!id)return wrong;
 const rows:any=await fetch(`${env.SUPABASE_URL}/rest/v1/bookkit_sign_in_codes?user_id=eq.${id}&select=*`,{headers:admin,signal}).then(r=>r.ok?r.json():[]).catch(()=>[]);
 const row=rows?.[0];if(!row)return wrong;
 const remove=()=>fetch(`${env.SUPABASE_URL}/rest/v1/bookkit_sign_in_codes?user_id=eq.${id}`,{method:'DELETE',headers:admin,signal});
 if(Date.parse(row.expires_at)<Date.now()||row.attempts>=CODE_TRIES){await remove();return wrong;}
 if(await codeHash(code,id,env.SUPABASE_SECRET_KEY)!==row.code_hash){
  await fetch(`${env.SUPABASE_URL}/rest/v1/bookkit_sign_in_codes?user_id=eq.${id}`,{method:'PATCH',headers:admin,signal,body:JSON.stringify({attempts:row.attempts+1})});
  return wrong;
 }
 await remove();
 const res=await fetch(`${env.SUPABASE_URL}/auth/v1/verify`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},signal,body:JSON.stringify({type:row.token_type,token_hash:row.token_hash})});
 const session:any=await res.json().catch(()=>null);
 if(!res.ok||!session?.access_token||!session?.refresh_token)return wrong;
 return json({access_token:session.access_token,refresh_token:session.refresh_token});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(url.pathname==='/api/sign-in-code'||url.pathname==='/api/sign-in-link')return signInCode(request,env,url).catch(()=>json({ok:true}));
 if(url.pathname==='/api/sign-in-verify')return signInVerify(request,env,url).catch(()=>json({error:'Could not sign in with that code. Try again.'},502));
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
   const policy=await bookPolicy(body,headers,env,signal);
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
