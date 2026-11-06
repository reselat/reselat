import {it,expect} from 'vitest';
// @ts-expect-error Node module
import {createTools} from '../scripts/agents/tools.mjs';
it('exposes scoped validated draft-only writes',async()=>{const id='11111111-1111-4111-8111-111111111111';const api=createTools({companyId:id,read:async()=>({items:[]}),write:async(kind: string,input: unknown)=>({kind,input})});expect(api.list().some((t: {name:string})=>t.name==='leads_upsert')).toBe(true);await expect(api.call('outreach_send',{})).rejects.toThrow();await expect(api.call('leads_upsert',{company_id:id,requestId:id,payload:{email:'bad'}})).rejects.toThrow();expect(await api.call('leads_upsert',{company_id:id,requestId:id,payload:{name:' Example ',email:'TEST@example.com'}})).toMatchObject({kind:'leads_upsert'});});
