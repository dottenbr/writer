import {diffChars} from 'diff';
export interface TextEdit {start:number;end:number;text:string}
export function textEdits(base:string,next:string):TextEdit[]{
 const parts=diffChars(base,next,{timeout:250});if(!parts)throw new Error('These edits need manual comparison. Your draft is retained.');
 const edits:TextEdit[]=[];let position=0,current:TextEdit|undefined;
 for(const part of parts){if(!part.added&&!part.removed){if(current){edits.push(current);current=undefined;}position+=part.value.length;continue;}
  current??={start:position,end:position,text:''};if(part.removed){position+=part.value.length;current.end=position;}else current.text+=part.value;
 }if(current)edits.push(current);return edits;
}
/** Merge only unambiguous, non-overlapping human edits. Never guess at a conflict. */
export function mergeBookText(base:string,ours:string,current:string):string{
 if(ours===base||ours===current)return current;if(current===base)return ours;
 const edits=textEdits(base,current);for(const own of textEdits(base,ours)){
  if(edits.some(other=>own.start===other.start&&own.end===other.end&&own.text===other.text))continue;
  const overlap=edits.some(other=>own.start===own.end?own.start>=other.start&&own.start<=other.end:other.start===other.end?other.start>=own.start&&other.start<=own.end:Math.max(own.start,other.start)<Math.min(own.end,other.end));
  if(overlap)throw new Error('The same passage changed in another session. Your draft is retained; compare it with the latest saved text before continuing.');edits.push(own);
 }
 let out='',position=0;for(const e of edits.sort((a,b)=>a.start-b.start)){out+=base.slice(position,e.start)+e.text;position=e.end;}return out+base.slice(position);
}
