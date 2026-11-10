import {parseBookkit} from './bookkit';
import {supabase} from './supabase-client';
import {mergeBookText} from './bookkit-merge';
import {listBookDocuments,readBookDocument,saveBookDocument,type BookDocumentRow} from './supabase-service';
export interface Suggestion {id:string;project_id:string;path:string;author_id:string;base_revision_id:string;proposed_content:string;version:number;status:'pending'|'accepted'|'rejected'|'withdrawn';created_at:string;updated_at:string;profiles?:{display_name:string;email:string};base?:{content:string}}
export interface Thread {id:string;path:string;author_id:string;suggestion_id:string|null;quoted_text:string;anchor_start:number|null;anchor_revision_id:string|null;resolved_at:string|null;created_at:string;bookkit_messages:Array<{id:string;author_id:string;body:string;created_at:string;profiles:{display_name:string;email:string}}>}
async function must(q:any){const {data,error}=await q;if(error)throw new Error(error.message);return data;}
export async function readBookReview(projectId:string,path:string):Promise<{suggestions:Suggestion[];threads:Thread[]}>{
 const [suggestions,threads]=await Promise.all([
 must(supabase.from('bookkit_suggestions').select('*,profiles!author_id(display_name,email),base:bookkit_revisions!base_revision_id(content)').eq('project_id',projectId).eq('path',path).order('created_at')),
 must(supabase.from('bookkit_threads').select('*,bookkit_messages(*,profiles!author_id(display_name,email))').eq('project_id',projectId).eq('path',path).order('created_at'))]);
 for(const thread of threads)thread.bookkit_messages.sort((a:any,b:any)=>a.created_at.localeCompare(b.created_at));return {suggestions,threads};
}
export async function saveSuggestion(projectId:string,doc:BookDocumentRow,content:string,existing?:Suggestion):Promise<Suggestion>{return must(supabase.rpc('save_bookkit_suggestion',{p_project_id:projectId,p_path:doc.path,p_base_revision_id:existing?.base_revision_id??doc.revision_id,p_content:content,p_suggestion_id:existing?.id??null,p_expected_version:existing?.version??null}));}
export async function decideSuggestion(s:Suggestion,decision:'accepted'|'rejected'):Promise<void>{
 let doc:BookDocumentRow|undefined,content:string|undefined;
 if(decision==='accepted'){doc=await readBookDocument(s.project_id,s.path);if(!s.base)throw new Error('Reload the suggestion before accepting.');content=mergeBookText(s.base.content,s.proposed_content,doc.content);const files=await listBookDocuments(s.project_id);parseBookkit(Object.fromEntries(files.filter(f=>!f.asset).map(f=>[f.path,f.path===s.path?content!:f.content])));}
 await must(supabase.rpc('decide_bookkit_suggestion',{p_suggestion_id:s.id,p_decision:decision,p_expected_version:s.version,p_document_version:doc?.version??null,p_merged_content:content??null}));
}
export async function saveMergedDocument(projectId:string,base:BookDocumentRow,content:string,validate?:(merged:string)=>void):Promise<BookDocumentRow>{
 for(let attempt=0;attempt<3;attempt++){const latest=await readBookDocument(projectId,base.path);const merged=mergeBookText(base.content,content,latest.content);validate?.(merged);try{return await saveBookDocument(projectId,base.path,merged,latest.version);}catch(e){if(!/changed|another|conflict/i.test((e as Error).message)||attempt===2)throw e;}}
 throw new Error('Document is changing rapidly. Your draft is retained. Try saving again.');
}
export const createThread=(projectId:string,path:string,body:string,quote='',anchorStart:number|null=null,revisionId:string|null=null,suggestionId:string|null=null)=>must(supabase.rpc('create_bookkit_thread',{p_project_id:projectId,p_path:path,p_body:body,p_quote:quote,p_anchor_start:anchorStart,p_anchor_revision_id:revisionId,p_suggestion_id:suggestionId}));
export const replyThread=(threadId:string,body:string)=>must(supabase.rpc('reply_bookkit_thread',{p_thread_id:threadId,p_body:body}));
export const resolveThread=(threadId:string,resolved:boolean)=>must(supabase.rpc('resolve_bookkit_thread',{p_thread_id:threadId,p_resolved:resolved}));
export function subscribeBookActivity(projectId:string,onChange:(event:{path:string;kind:string})=>void,onStatus:(status:string)=>void){
 const channel=supabase.channel('bookkit:'+projectId+':'+crypto.randomUUID()).on('postgres_changes',{event:'INSERT',schema:'public',table:'bookkit_activity',filter:'project_id=eq.'+projectId},payload=>onChange(payload.new as {path:string;kind:string})).subscribe(status=>onStatus(status));
 return()=>{void supabase.removeChannel(channel);};
}
