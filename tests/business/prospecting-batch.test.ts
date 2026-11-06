import {it,expect} from 'vitest';
import {parseLeadBatch} from '@/modules/business/lead-batch';
it('parses rows, merges normalized emails and retains visible row errors',()=>{
 const result=parseLeadBatch(JSON.stringify([{name:'A',email:'A@example.com'},{name:'B',email:'a@example.com'},{email:'bad'}]));
 expect(result.items).toEqual([{name:'B',email:'a@example.com',source:'json'}]);
 expect(result.errors[0].row).toBe(3);
 expect(()=>parseLeadBatch('{}')).toThrow();
 expect(()=>parseLeadBatch('[')).toThrow();
});
