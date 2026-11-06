import {z} from 'zod';
import {mapsRowSchema} from '@/modules/business/maps-lead-adapter';

export const DEFAULT_LEADTOOL_BASE_URL='https://aiclient.reselat.de5.net';
const baseUrlSchema=z.url().refine(value=>{
 const url=new URL(value);
 return url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname));
});
export function leadtoolBaseUrl(){
 const parsed=baseUrlSchema.safeParse(process.env.LEADTOOL_BASE_URL||DEFAULT_LEADTOOL_BASE_URL);
 if(!parsed.success)throw Error('LEADTOOL_CONFIG');
 return parsed.data.replace(/\/+$/,'');
}

export const mapsSearchParams=z.object({
 country:z.string().trim().min(1).max(100),
 industry:z.string().trim().min(1).max(100),
 city:z.string().trim().min(1).max(100).optional(),
 maxResults:z.number().int().min(1).max(60).default(20),
 language:z.string().trim().min(2).max(20).regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/).optional(),
 enrich:z.boolean().default(false)
}).strict();
export type MapsSearchParams=z.infer<typeof mapsSearchParams>;

const searchResponse=z.object({rows:z.array(mapsRowSchema).max(500),note:z.string().trim().max(20000).optional()}).strip();
const enrichResponse=z.object({results:z.array(z.object({
 i:z.number().int().min(0).max(499),
 emails:z.array(z.string().trim().max(320)).max(20),
 source:z.string().trim().max(200).optional()
})).max(500)}).strip();
const targetsSchema=z.array(z.object({i:z.number().int().min(0).max(499),url:z.url().refine(value=>/^https?:/i.test(value))})).min(1).max(100);

async function post(path:string,body:unknown){
 const base=leadtoolBaseUrl();
 let response:Response;
 try{
  response=await fetch(`${base}${path}`,{
   method:'POST',
   headers:{'content-type':'application/json','x-app':'leadtool'},
   body:JSON.stringify(body),
   cache:'no-store',
   redirect:'error',
   signal:AbortSignal.timeout(20000)
  });
 }catch(error){
  const name=error instanceof DOMException?error.name:'';
  throw Error(name==='TimeoutError'||name==='AbortError'?'LEADTOOL_TIMEOUT':'LEADTOOL_UPSTREAM_FAILED');
 }
 if(!response.ok)throw Error('LEADTOOL_UPSTREAM_FAILED');
 try{return await response.json();}
 catch{throw Error('LEADTOOL_INVALID_RESPONSE');}
}

/** Server-side aiclient search. Never called from the browser directly. */
export async function searchMaps(input:unknown){
 const params=mapsSearchParams.parse(input);
 const raw=await post('/api/search',{
  country:params.country,
  industry:params.industry,
  ...(params.city?{city:params.city}:{}),
  maxResults:params.maxResults,
  ...(params.language?{language:params.language}:{})
 });
 const parsed=searchResponse.safeParse(raw);
 if(!parsed.success)throw Error('LEADTOOL_INVALID_RESPONSE');
 return parsed.data;
}

/** Optional website email enrichment; the caller may continue without it. */
export async function enrichMaps(targets:{i:number;url:string}[]){
 const raw=await post('/api/enrich',{targets:targetsSchema.parse(targets)});
 const parsed=enrichResponse.safeParse(raw);
 if(!parsed.success)throw Error('LEADTOOL_INVALID_RESPONSE');
 return parsed.data.results;
}
