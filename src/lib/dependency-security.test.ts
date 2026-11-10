import {expect,it} from 'vitest';
import {mergeAttributes} from '@tiptap/core';
it('installed TipTap rejects prototype mutation from JSON attributes (GHSA-cp6q-959q-f8rh)',()=>{
 const untrusted=JSON.parse('{"__proto__":{"onerror":"canary","src":"invalid:"}}');
 const attrs=mergeAttributes({class:'safe'},untrusted);
 expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
 expect(attrs.onerror).toBeUndefined();expect(attrs.src).toBeUndefined();
 const enumerable=[];for(const key in attrs)enumerable.push(key);
 expect(enumerable).not.toContain('onerror');expect(enumerable).not.toContain('src');
});
