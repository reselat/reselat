import {beforeAll,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {loadBindings,minify,transformSync} from 'next/dist/build/swc';
import {z} from 'zod';
import {checkAdmin,IdentityError} from '../src/server/auth/employee';
import {projectRecord} from '../src/server/workspace/records';
import {accountError} from '../src/server/auth/http';

let compiled='';
beforeAll(async()=>{
 await loadBindings();
 const source=await readFile('src/app/api/workspace/records/route.ts','utf8');
 const start=source.indexOf('const kindSchema='),end=source.indexOf('\nconst command=');
 if(start<0||end<start)throw new Error('HANDLER_FIXTURE_NOT_FOUND');
 const transformed=transformSync(source.slice(start,end),{jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}});
 compiled=(await minify(transformed.code,{compress:true,mangle:true})).code;
});

function handler(role:'admin'|'sales'){
 const query=vi.fn(async()=>[{id:'synthetic',companyId:'company',ownerId:'actor',kind:'customer',version:1,payload:{name:'Synthetic buyer'}}]);
 const errors=vi.fn();const exports:Record<string,unknown>={};
 new Function('exports','z','requireEmployee','checkAdmin','IdentityError','businessDatabase','projectRecord','accountError','reportDatabaseFailure',compiled)(exports,z,async()=>({employee:{id:'actor',companyId:'company',role,enabled:true,version:1},aal:'aal2'}),checkAdmin,IdentityError,async()=>query,projectRecord,accountError,errors);
 const get=exports.GET;if(typeof get!=='function')throw new Error('GET_EXPORT_MISSING');
 return {get,query,errors};
}

it('executes the actual records handler after the production SWC transformation and minification',async()=>{
 const {get,query,errors}=handler('admin');
 const response:unknown=await get(new Request('https://example.test/api/workspace/records?kind=customer'));
 expect(response).toBeInstanceOf(Response);if(!(response instanceof Response))throw new Error('RESPONSE_MISSING');
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({records:[{version:1,payload:{name:'Synthetic buyer'}}]});
 expect(query).toHaveBeenCalledOnce();expect(errors).not.toHaveBeenCalled();
});
it('preserves the supplier restriction in the minified production handler',async()=>{
 const {get,query}=handler('sales');
 const response:unknown=await get(new Request('https://example.test/api/workspace/records?kind=supplier'));
 if(!(response instanceof Response))throw new Error('RESPONSE_MISSING');
 expect(response.status).toBe(403);expect(query).not.toHaveBeenCalled();
});
