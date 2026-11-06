import {z} from 'zod';
import {normalizeMapsCandidate} from './maps-lead-adapter';
const lead=z.object({name:z.string().trim().min(1).max(20000),email:z.email().transform(v=>v.toLowerCase()),source:z.literal('json').optional()}).strict();
export function parseLeadBatch(text:string){
 const rows:unknown=JSON.parse(text);
 if(!Array.isArray(rows)||rows.length>500)throw Error('请输入最多 500 项的 JSON 数组');
 const items=new Map<string,{name:string;email:string;source:'json'|'maps';placeId?:string;mapsUrl?:string;notes?:string;address?:string;phone?:string}>();
 const errors:{row:number;message:string}[]=[];
 rows.forEach((row,index)=>{if(row && typeof row==='object' && 'source' in row && row.source==='maps'){try{const item=normalizeMapsCandidate(row);items.set(item.email,item);}catch(error){errors.push({row:index+1,message:error instanceof Error?error.message:'无效 Maps 候选'});}return;}const parsed=lead.safeParse(row);if(!parsed.success)errors.push({row:index+1,message:parsed.error.message});else items.set(parsed.data.email,{...parsed.data,source:'json'});});
 return {items:[...items.values()],errors};
}
