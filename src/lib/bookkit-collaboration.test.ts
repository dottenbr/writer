import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),read:vi.fn(),save:vi.fn(),list:vi.fn()}));
vi.mock('./supabase-client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('./supabase-service',()=>({readBookDocument:mocks.read,saveBookDocument:mocks.save,listBookDocuments:mocks.list}));
import {decideSuggestion,saveMergedDocument,type Suggestion} from './bookkit-collaboration';
beforeEach(()=>{vi.resetAllMocks();mocks.rpc.mockResolvedValue({error:null});});
const config='title: Test\nmanuscript:\n  dir: manuscript\n';
const suggestion:Suggestion={id:'suggestion',project_id:'project',path:'book.yaml',author_id:'editor',base_revision_id:'base',proposed_content:'title: Broken\n',version:2,status:'pending',created_at:'',updated_at:'',base:{content:config}};
it('rejects a structurally invalid accepted suggestion before changing canonical text',async()=>{
 mocks.read.mockResolvedValue({path:'book.yaml',content:config,version:3});mocks.list.mockResolvedValue([{path:'book.yaml',content:config,version:3}]);
 await expect(decideSuggestion(suggestion,'accepted')).rejects.toThrow('manuscript.dir');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('accepts valid text with the reviewed suggestion version and current document version',async()=>{
 mocks.read.mockResolvedValue({path:'book.yaml',content:config,version:3});mocks.list.mockResolvedValue([{path:'book.yaml',content:config,version:3}]);
 await decideSuggestion({...suggestion,proposed_content:config.replace('Test','Updated')},'accepted');
 expect(mocks.rpc).toHaveBeenCalledWith('decide_bookkit_suggestion',expect.objectContaining({p_expected_version:2,p_document_version:3,p_merged_content:config.replace('Test','Updated')}));
});
it('validates the combined concurrent result before autosaving it',async()=>{
 const base={path:'file.md',content:'First.\nLast.',version:1};mocks.read.mockResolvedValue({...base,content:'First.\nLast changed.',version:2});
 const validate=vi.fn(()=>{throw new Error('Combined structure is invalid');});
 await expect(saveMergedDocument('project',base,'First changed.\nLast.',validate)).rejects.toThrow('Combined structure');
 expect(validate).toHaveBeenCalledWith('First changed.\nLast changed.');expect(mocks.save).not.toHaveBeenCalled();
});
