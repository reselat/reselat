import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const state=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db!)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(actor:unknown)=>actor}));
import {mapsImportCommand,mapsSearchCommand} from '@/server/business/maps';

const searchRows={rows:[
 {placeId:'ChIJ-email',name:'Buyer GmbH',industry:'valves',country:'Germany',city:'Hamburg',address:'Road 1',phone:'+49 40 1',email:'Sales@Example.com',emailSource:'website',website:'https://buyer.example',rating:4.5,reviews:42,mapsUrl:'https://maps.google.com/?cid=1'},
 {placeId:'ChIJ-noemail',name:'Second Buyer',industry:'valves',country:'Germany',city:'Bremen',address:'Road 2',email:'',website:'https://second.example',rating:4.1,reviews:7,mapsUrl:'https://maps.google.com/?cid=2'}
]};

function fetchMock(search:unknown=searchRows,enrich:unknown={results:[]}){
 return vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith('/api/search'))return Response.json(search);
  if(url.endsWith('/api/enrich'))return Response.json(enrich);
  throw Error('UNEXPECTED_URL '+url);
 });
}

beforeEach(async()=>{
 state.db=await openBusiness([...businessMigrations,'20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261105160000_outreach_send.sql','20261104000000_agent_foundation.sql','20261105100000_agent_roles.sql']);
 vi.stubEnv('LEADTOOL_BASE_URL','https://leadtool.example.test');
});
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await state.db?.close();});

it('imports maps search results with source=maps, keeps metadata and stops at leads',async()=>{
 const fetch=fetchMock();vi.stubGlobal('fetch',fetch);
 const result=await mapsImportCommand(admin,{requestId:crypto.randomUUID(),payload:{country:'Germany',industry:'valves',city:'Hamburg',maxResults:40}},'prospecting');
 expect(result).toMatchObject({imported:2,skipped:0});
 expect(result.leadIds).toHaveLength(2);
 const rows=(await state.db!.query('select name,email,source,place_id,maps_url,address,phone,notes from trade_business.leads order by name')).rows as {name:string;email:string;source:string;place_id:string;maps_url:string;address:string;phone:string;notes:string}[];
 expect(rows).toHaveLength(2);
 expect(rows[0]).toMatchObject({name:'Buyer GmbH',email:'sales@example.com',source:'maps',place_id:'ChIJ-email',maps_url:'https://maps.google.com/?cid=1',address:'Road 1',phone:'+49 40 1'});
 expect(rows[0].notes).toContain('行业：valves');
 expect(rows[1]).toMatchObject({name:'Second Buyer',email:'noemail+chij-noemail@maps.import.local',source:'maps',place_id:'ChIJ-noemail'});
 expect(rows[1].notes).toContain('无公开邮箱');
 expect((await state.db!.query("select count(*)::int as n from trade_business.outreach_drafts")).rows[0]).toEqual({n:0});
 expect((await state.db!.query("select count(*)::int as n from trade_business.approval_queue")).rows[0]).toEqual({n:0});
 expect((await state.db!.query("select count(*)::int as n from trade_business.audit_events where action='maps_import'")).rows[0]).toEqual({n:1});
 const [url,init]=fetch.mock.calls[0]!;
 expect(url).toBe('https://leadtool.example.test/api/search');
 expect(JSON.parse(init!.body as string)).toEqual({country:'Germany',industry:'valves',city:'Hamburg',maxResults:40});
});

it('replays the same import request id without duplicating leads and rejects a changed payload',async()=>{
 vi.stubGlobal('fetch',fetchMock());
 const raw={requestId:crypto.randomUUID(),payload:{country:'Germany',industry:'valves'}};
 const first=await mapsImportCommand(admin,raw,'prospecting');
 const second=await mapsImportCommand(admin,raw,'prospecting');
 expect(second).toEqual(first);
 expect((await state.db!.query('select count(*)::int as n from trade_business.leads')).rows[0]).toEqual({n:2});
 await expect(mapsImportCommand(admin,{...raw,payload:{country:'Germany',industry:'pumps'}},'prospecting')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
});

it('enriches missing emails from websites and surfaces an enrich warning without blocking import',async()=>{
 const fetch=fetchMock({rows:[{placeId:'ChIJ-enrich',name:'Enriched Buyer',industry:'valves',country:'Germany',website:'https://enriched.example',email:''}]},{results:[{i:0,emails:['INFO@enriched.example'],source:'website'}]});
 vi.stubGlobal('fetch',fetch);
 const searched=await mapsSearchCommand(admin,{requestId:crypto.randomUUID(),payload:{country:'Germany',industry:'valves',enrich:true}});
 expect(searched.rows[0]).toMatchObject({email:'info@enriched.example',emailSource:'website'});
 const result=await mapsImportCommand(admin,{requestId:crypto.randomUUID(),payload:{country:'Germany',industry:'valves',enrich:true}});
 expect(result).toMatchObject({imported:1});
 expect((await state.db!.query('select email from trade_business.leads')).rows[0]).toEqual({email:'info@enriched.example'});
 expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({targets:[{i:0,url:'https://enriched.example'}]});
});

it('imports UI-selected normalized rows without calling the network',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const result=await mapsImportCommand(admin,{requestId:crypto.randomUUID(),payload:{rows:[{name:'Selected Buyer',email:'selected@example.test',source:'maps',placeId:'place-selected',mapsUrl:'https://maps.google.com/?cid=9',notes:'无公开邮箱'}]}});
 expect(result).toMatchObject({imported:1});
 expect(fetch).not.toHaveBeenCalled();
 expect((await state.db!.query('select source,place_id,maps_url from trade_business.leads')).rows[0]).toMatchObject({source:'maps',place_id:'place-selected'});
});

it('denies non-admin and roles without the prospecting leads_upsert authority',async()=>{
 vi.stubGlobal('fetch',fetchMock());
 const raw={requestId:crypto.randomUUID(),payload:{country:'Germany',industry:'valves'}};
 await expect(mapsImportCommand(sales,raw,'prospecting')).rejects.toThrow();
 await expect(mapsSearchCommand(sales,raw)).rejects.toThrow();
 await expect(mapsImportCommand(admin,raw,'diligence')).rejects.toThrow('ROLE_ACTION_DENIED');
 expect((await state.db!.query('select count(*)::int as n from trade_business.leads')).rows[0]).toEqual({n:0});
});

it('reports rows that cannot become leads instead of inventing identifiers',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({rows:[{name:'No place id',industry:'valves'}]})));
 await expect(mapsImportCommand(admin,{requestId:crypto.randomUUID(),payload:{country:'Germany',industry:'valves'}})).rejects.toThrow('NO_IMPORTABLE_MAPS_ROWS');
 expect((await state.db!.query('select count(*)::int as n from trade_business.leads')).rows[0]).toEqual({n:0});
});
