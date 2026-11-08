import type { LlmSettings } from './local-config';
import { AI_PROMPT_LIMIT } from './ai-policy';
export { HUMAN_AUTHORSHIP_POLICY } from './ai-policy';
type LlmProvider='bookkit'|'anthropic'|'openai';
export const INCLUDED_DEFAULT_MODEL='@cf/moonshotai/kimi-k2.6';
/** The provider a request actually uses: your own key when set, otherwise the model included with Bookkit. */
export function effectiveProvider(settings:LlmSettings):{provider:LlmProvider;model:string}{
 const p=settings.selectedProvider;
 if(p==='anthropic'&&settings.anthropicKey)return {provider:p,model:settings.selectedModel};
 if(p==='openai'&&settings.openaiKey)return {provider:p,model:settings.selectedModel};
 return {provider:'bookkit',model:p==='bookkit'&&settings.selectedModel.startsWith('@cf/')?settings.selectedModel:INCLUDED_DEFAULT_MODEL};
}
export interface ProviderModelOption {id:string;label:string}
export interface CompletionOptions {mode?:'review'|'companion';path?:string}
async function aiRequest(body:Record<string,unknown>,settings:LlmSettings,provider:LlmProvider):Promise<any>{
 const key=provider==='bookkit'?'':provider==='anthropic'?settings.anthropicKey:settings.openaiKey;if(provider!=='bookkit'&&!key)throw new Error(`Add your ${provider} API key in AI settings.`);
 const {supabase}=await import('./supabase-client');const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Sign in to use editorial assistance.');
 const response=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token,...(key?{'X-Provider-Key':key}:{})},body:JSON.stringify({...body,provider}),signal:AbortSignal.timeout(100000)}).catch(e=>{throw new Error(e.name==='TimeoutError'?'The provider timed out. Try a narrower request.':'Unable to reach editorial assistance. Check your connection.');});
 const result=await response.json().catch(()=>null);if(!response.ok||!result)throw new Error(result?.error??'Editorial assistance is unavailable.');return result;
}
export async function fetchProviderModels(provider:LlmProvider,settings:LlmSettings):Promise<ProviderModelOption[]>{return (await aiRequest({action:'models'},settings,provider)).models.sort((a:ProviderModelOption,b:ProviderModelOption)=>a.label.localeCompare(b.label));}
export async function testProviderConnection(provider:LlmProvider,settings:LlmSettings):Promise<{ok:boolean;message:string}>{try{const models=await fetchProviderModels(provider,settings);return {ok:!!models.length,message:models.length?`${provider} connected (${models.length} models)`:`No text models returned by ${provider}`};}catch(e){return {ok:false,message:(e as Error).message};}}
export async function testLlmConnection(settings:LlmSettings):Promise<{ok:boolean;message:string}>{try{await completeText('Reply with only: OK',settings);return {ok:true,message:'Connection successful'};}catch(e){return {ok:false,message:(e as Error).message};}}
export async function completeText(prompt:string,settings:LlmSettings,options:CompletionOptions={}):Promise<string>{
 if(prompt.length>AI_PROMPT_LIMIT)throw new Error('This request is too large. Select fewer context chapters (maximum 180,000 characters).');
 const {useProjectStore}=await import('../store/useProjectStore');
 const {provider,model}=effectiveProvider(settings);
 if(provider==='bookkit'&&prompt.length>90000)throw new Error('This request is too large for the included model. Select fewer context chapters (maximum 90,000 characters), or connect your own Anthropic or OpenAI key.');
 return (await aiRequest({action:'complete',prompt,model,projectId:useProjectStore.getState().currentProjectId,mode:options.mode??'review',path:options.path},settings,provider)).text;
}
