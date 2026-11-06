import {expect,it,vi} from 'vitest';
import {z} from 'zod';
vi.mock('@/server/auth/session',()=>({requireEmployee:vi.fn()}));
import {bodyOf,businessError} from '../../src/server/business/http';
const schema=z.object({name:z.string()});
it('reports invalid JSON safely as invalid input',async()=>{
 try{await bodyOf(new Request('https://example.test',{method:'POST',body:'{private invalid'}),schema);throw new Error('EXPECTED_REJECTION');}
 catch(error){const response=businessError(error);expect(response.status).toBe(400);expect(await response.json()).toMatchObject({code:'INVALID_INPUT'});}
});
it('limits UTF-8 request bytes rather than JavaScript string length',async()=>{
 const body=JSON.stringify({name:'中'.repeat(40000)});
 try{await bodyOf(new Request('https://example.test',{method:'POST',body}),schema);throw new Error('EXPECTED_REJECTION');}
 catch(error){const response=businessError(error);expect(response.status).toBe(413);expect(await response.json()).toMatchObject({code:'BODY_TOO_LARGE'});}
});
it('accepts bounded streamed JSON without a content-length header',async()=>{
 expect(await bodyOf(new Request('https://example.test',{method:'POST',body:JSON.stringify({name:'Synthetic'})}),schema)).toEqual({name:'Synthetic'});
});
it('stops reading an oversized stream and cancels the unread remainder',async()=>{
 const cancel=vi.fn();
 const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(60000));},cancel});
 const options={method:'POST',body:stream,duplex:'half'};
 const request=new Request('https://example.test',options);
 await expect(bodyOf(request,schema)).rejects.toThrow('BODY_TOO_LARGE');
 expect(cancel).toHaveBeenCalledOnce();
});
it('rejects malformed UTF-8 and does not trust a short declared length',async()=>{
 await expect(bodyOf(new Request('https://example.test',{method:'POST',body:new Uint8Array([0xff])}),schema)).rejects.toThrow('INVALID_INPUT');
 await expect(bodyOf(new Request('https://example.test',{method:'POST',headers:{'content-length':'1'},body:JSON.stringify({name:'x'.repeat(100001)})}),schema)).rejects.toThrow('BODY_TOO_LARGE');
});
it('reports a denied Agent role as a scoped authorization failure',async()=>{
 const result=businessError(new Error('ROLE_ACTION_DENIED'));
 expect(result.status).toBe(403);
 expect(await result.json()).toMatchObject({ok:false,code:'ROLE_ACTION_DENIED'});
});
it.each(['DEPENDENCY_NOT_READY','INVALID_STEPS_GRAPH'])('reports graph rejection %s as a business conflict',async code=>{
 const response=businessError(new Error(code));expect(response.status).toBe(409);
 expect(await response.json()).toMatchObject({ok:false,code});
});
