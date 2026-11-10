import {describe,it,expect} from 'vitest';
import {normalizedBookEntries} from './bookkit-import';
import type {Entry} from '@zip.js/zip.js';
const file=(filename:string,directory=false,other:object={}):Entry=>({filename,directory,uncompressedSize:0,unixMode:directory?0o40755:0o100644,...other}) as Entry;
describe('Bookkit archive selection',()=>{
 it('unwraps a single book directory and preserves empty directories',()=>{
  expect(normalizedBookEntries([file('novel/',true),file('novel/book.yaml'),file('novel/manuscript/',true),file('novel/bible/canon.md')])?.map(f=>f.path)).toEqual(['book.yaml','manuscript/','bible/canon.md']);
 });
 it('rejects traversal, duplicates, links and outside files',()=>{
  for(const entries of [[file('../book.yaml')],[file('book.yaml'),file('book.yaml')],[file('book.yaml'),file('link',false,{symlink:true})],[file('novel/book.yaml'),file('outside.md')],[file('book.yaml'),file('bible'),file('bible/canon.md')]])expect(()=>normalizedBookEntries(entries)).toThrow();
 });
 it('recognizes legacy archives without creating a book',()=>expect(normalizedBookEntries([file('.writer/project.json')])).toBeNull());
});
