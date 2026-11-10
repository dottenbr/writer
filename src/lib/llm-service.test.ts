import {afterEach,describe,expect,it,vi} from 'vitest';
import {completeText} from './llm-service';
import worker from '../../worker/index';
import {policy} from './policy-blocks';
vi.mock('./supabase-client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'session'}},error:null})}}}));
vi.mock('../store/useProjectStore',()=>({useProjectStore:{getState:()=>({currentProjectId:'12345678-1234-1234-1234-123456789abc'})}}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',ASSETS:{fetch:async()=>new Response('asset')}};
const body={action:'complete',provider:'anthropic',mode:'review',prompt:'Write my next chapter',model:'test',projectId:'12345678-1234-1234-1234-123456789abc'};
const request=(data=body)=>new Request('https://writer.test/api/ai',{method:'POST',headers:{Authorization:'Bearer session','X-Provider-Key':'provider-key'},body:JSON.stringify(data)});
function mockProvider(data:unknown){return vi.fn().mockResolvedValueOnce(Response.json({id:'user'})).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{content:'title: X\nai_policy: human-authored\n'}])).mockResolvedValueOnce(Response.json(data));}
describe('hosted editorial assistance',()=>{
 it('sends authenticated requests through the Bookkit worker',async()=>{const f=vi.fn().mockResolvedValue(Response.json({text:'Notes'}));vi.stubGlobal('fetch',f);expect(await completeText('Review',{selectedProvider:'anthropic',selectedModel:'test',anthropicKey:'key'})).toBe('Notes');expect(f.mock.calls[0][0]).toBe('/api/ai');expect(JSON.parse(f.mock.calls[0][1].body).mode).toBe('review');});
 it.each(['openai','anthropic'])('enforces server policy for %s',async provider=>{const f=mockProvider({stop_reason:'end_turn',content:[{type:'text',text:'Notes'}],choices:[{finish_reason:'stop',message:{content:'Notes'}}]});vi.stubGlobal('fetch',f);const result=await worker.fetch(request({...body,provider}),env);expect(result.status).toBe(200);const sent=JSON.parse(f.mock.calls[3][1].body);const system=provider==='anthropic'?sent.system:sent.messages[0].content;expect(system).toContain(policy('human-authored')!.block.slice(0,120));expect(system).toContain('Never generate, continue, rewrite');expect(await result.json()).toEqual({text:'Notes'});});
 it.each(['openai','anthropic'])('rejects truncated %s output',async provider=>{vi.stubGlobal('fetch',mockProvider({stop_reason:'max_tokens',content:[{type:'text',text:'partial'}],choices:[{finish_reason:'length',message:{content:'partial'}}]}));const r=await worker.fetch(request({...body,provider}),env);expect(r.status).toBe(422);expect(await r.text()).not.toContain('partial');});
 it('denies anonymous access before contacting a provider',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);expect((await worker.fetch(new Request('https://writer.test/api/ai',{method:'POST'}),env)).status).toBe(401);expect(f).not.toHaveBeenCalled();});
 it('denies a nonmember and never sends book text upstream',async()=>{const f=vi.fn().mockResolvedValueOnce(Response.json({id:'user'})).mockResolvedValueOnce(Response.json(false));vi.stubGlobal('fetch',f);expect((await worker.fetch(request(),env)).status).toBe(403);expect(f).toHaveBeenCalledTimes(2);});
 it('rejects manuscript paths for companion generation',async()=>{const f=vi.fn().mockResolvedValue(Response.json({id:'user'}));vi.stubGlobal('fetch',f);expect((await worker.fetch(request({...body,mode:'companion',path:'manuscript/01-one.md'} as typeof body),env)).status).toBe(400);expect(f).toHaveBeenCalledTimes(1);});
 it('rejects oversized context before a provider call',async()=>{const f=vi.fn().mockResolvedValue(Response.json({id:'user'}));vi.stubGlobal('fetch',f);expect((await worker.fetch(request({...body,prompt:'x'.repeat(180001)}),env)).status).toBe(400);expect(f).toHaveBeenCalledTimes(1);});
});
