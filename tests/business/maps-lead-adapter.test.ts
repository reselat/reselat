import {it,expect} from 'vitest';
import {parseLeadBatch} from '@/modules/business/lead-batch';
it('normalizes Maps fixtures, rejects incomplete candidates and keeps last email',()=>{
 const result=parseLeadBatch(JSON.stringify([{source:'maps',name:' First ',email:'BUYER@example.com',place_id:'p1',address:' Road ',phone:'123'},{source:'maps',name:' Last ',email:'buyer@example.com',maps_url:'https://maps.google.com/?q=x',notes:' checked '},{source:'maps',name:'Missing'},{source:'maps',name:' ',email:'a@example.com'}]));
 expect(result.items).toEqual([{source:'maps',name:'Last',email:'buyer@example.com',mapsUrl:'https://maps.google.com/?q=x',notes:'checked'}]);
 expect(result.errors.map(e=>e.row)).toEqual([3,4]);
});
