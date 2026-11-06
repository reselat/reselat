import {expect,it} from 'vitest';
import {isSyntheticMapsEmail,mapsRowToLead,normalizeMapsCandidate,syntheticMapsEmail} from '@/modules/business/maps-lead-adapter';
import {parseLeadBatch} from '@/modules/business/lead-batch';

it('uses a stable local placeholder email when aiclient has no public email',()=>{
 const row={placeId:'ChIJN1t_tDeuEmsRUsoyG83frY4',name:'Buyer GmbH',industry:'valves',country:'Germany',city:'Hamburg',address:'Road 1',phone:'+49 40 1',website:'https://buyer.example',rating:4.6,reviews:120,mapsUrl:'https://maps.google.com/?cid=1'};
 const lead=mapsRowToLead(row);
 expect(lead.email).toBe('noemail+chijn1t_tdeuemsrusoyg83fry4@maps.import.local');
 expect(lead.email).toBe(syntheticMapsEmail(row.placeId));
 expect(isSyntheticMapsEmail(lead.email)).toBe(true);
 expect(lead).toMatchObject({source:'maps',placeId:row.placeId,mapsUrl:row.mapsUrl,address:'Road 1',phone:'+49 40 1'});
 for(const value of ['无公开邮箱','行业：valves','城市：Hamburg','官网：https://buyer.example','评分：4.6（120 条评价）'])expect(lead.notes).toContain(value);
 expect(mapsRowToLead({...row,email:'Sales@Example.com'}).email).toBe('sales@example.com');
});

it('falls back to a placeholder for malformed upstream email and rejects rows without placeId',()=>{
 const lead=mapsRowToLead({placeId:'place-2',name:'No Mail',email:'not-an-email'});
 expect(lead.email).toBe('noemail+place-2@maps.import.local');
 expect(lead.notes).toContain('上游邮箱格式无效');
 expect(mapsRowToLead({placeId:'place-empty-name',name:'  ',email:'buyer@example.test'}).name).toBe('place-empty-name');
 expect(()=>mapsRowToLead({name:'Missing place id'})).toThrow('缺少邮箱或 placeId');
 expect(()=>syntheticMapsEmail('   ')).toThrow('INVALID_PLACE_ID');
});

it('keeps the existing JSON Maps import working when email is absent but placeId exists',()=>{
 const result=parseLeadBatch(JSON.stringify([{source:'maps',name:'No Mail',placeId:'place-3',notes:'checked'},{source:'maps',name:'No Key'}]));
 expect(result.items).toMatchObject([{name:'No Mail',email:'noemail+place-3@maps.import.local',source:'maps',placeId:'place-3'}]);
 expect(result.items[0].notes).toContain('无公开邮箱');
 expect(result.items[0].notes).toContain('checked');
 expect(result.errors.map(error=>error.row)).toEqual([2]);
 expect(normalizeMapsCandidate({name:'With Mail',email:'BUYER@Example.com',placeId:'place-4'})).toMatchObject({email:'buyer@example.com',placeId:'place-4'});
});
