import {afterEach,expect,it,vi} from 'vitest';
import {enrichMaps,searchMaps} from '@/server/business/leadtool';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

it('posts the documented search body with x-app and the configured base URL',async()=>{
 const fetchMock=vi.fn().mockResolvedValue(json({rows:[{placeId:'ChIJ1',name:'Buyer GmbH',industry:'valves',country:'Germany',city:'Hamburg',email:'Sales@Example.com',website:'https://buyer.example'}],note:'cached'}));
 vi.stubGlobal('fetch',fetchMock);vi.stubEnv('LEADTOOL_BASE_URL','https://leadtool.example.test/');
 const result=await searchMaps({country:'Germany',industry:'valves',city:'Hamburg',maxResults:40,language:'de',enrich:true});
 expect(result.rows[0]).toMatchObject({placeId:'ChIJ1',name:'Buyer GmbH',email:'Sales@Example.com'});
 expect(result.note).toBe('cached');
 const [url,init]=fetchMock.mock.calls[0];
 expect(url).toBe('https://leadtool.example.test/api/search');
 expect(init).toMatchObject({method:'POST',headers:{'content-type':'application/json','x-app':'leadtool'}});
 expect(JSON.parse(init.body)).toEqual({country:'Germany',industry:'valves',city:'Hamburg',maxResults:40,language:'de'});
});

it('rejects upstream errors, malformed payloads and timeouts without leaking response bodies',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private upstream detail',{status:500})));
 await expect(searchMaps({country:'Germany',industry:'valves'})).rejects.toThrow('LEADTOOL_UPSTREAM_FAILED');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({notRows:[]})));
 await expect(searchMaps({country:'Germany',industry:'valves'})).rejects.toThrow('LEADTOOL_INVALID_RESPONSE');
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('timeout','TimeoutError')));
 await expect(searchMaps({country:'Germany',industry:'valves'})).rejects.toThrow('LEADTOOL_TIMEOUT');
});

it('refuses insecure non-local base URLs before any request',async()=>{
 const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);vi.stubEnv('LEADTOOL_BASE_URL','http://aiclient.example.test');
 await expect(searchMaps({country:'Germany',industry:'valves'})).rejects.toThrow('LEADTOOL_CONFIG');
 expect(fetchMock).not.toHaveBeenCalled();
});

it('maps website enrichment targets and returns email candidates',async()=>{
 const fetchMock=vi.fn().mockResolvedValue(json({results:[{i:2,emails:['info@buyer.example'],source:'website'}]}));
 vi.stubGlobal('fetch',fetchMock);
 const result=await enrichMaps([{i:2,url:'https://buyer.example/contact'}]);
 expect(result).toEqual([{i:2,emails:['info@buyer.example'],source:'website'}]);
 expect(fetchMock.mock.calls[0][0]).toBe('https://aiclient.reselat.de5.net/api/enrich');
 expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({targets:[{i:2,url:'https://buyer.example/contact'}]});
});
