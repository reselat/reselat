import {z} from 'zod';
const text=z.string().trim().min(1).max(20000);
const rawText=z.string().trim().max(20000).nullable().optional();
const placeIdText=z.string().trim().min(1).max(1000);
const emailText=z.string().trim().pipe(z.email()).transform(value=>value.toLowerCase());

/** Raw aiclient row plus the already-normalized lead fields the UI sends back. */
export const mapsRowSchema=z.object({
 placeId:placeIdText.optional(),place_id:placeIdText.optional(),
 name:z.string().trim().max(20000).optional(),
 industry:rawText,country:rawText,city:rawText,address:rawText,phone:rawText,
 email:rawText,emailSource:rawText,website:rawText,
 rating:z.union([z.number(),z.string()]).nullable().optional(),
 reviews:z.union([z.number(),z.string()]).nullable().optional(),
 mapsUrl:rawText,maps_url:rawText,notes:rawText,
 source:z.literal('maps').optional()
}).strip();
export type MapsRow=z.infer<typeof mapsRowSchema>;

export const mapsSearchResponseSchema=z.object({
 rows:z.array(mapsRowSchema).max(500),
 note:z.string().max(20000).optional(),
 enriched:z.boolean().optional(),
 enrichError:z.string().max(200).optional()
});
export type MapsSearchResponse=z.infer<typeof mapsSearchResponseSchema>;

export const mapsImportResultSchema=z.object({
 id:z.string(),leadIds:z.array(z.string()),imported:z.number().int().nonnegative(),skipped:z.number().int().nonnegative(),
 errors:z.array(z.object({row:z.number().int().positive(),message:z.string()})).optional(),
 enrichError:z.string().max(200).optional()
});
export type MapsImportResult=z.infer<typeof mapsImportResultSchema>;

export type MapsLead={name:string;email:string;source:'maps';placeId?:string;mapsUrl?:string;notes?:string;address?:string;phone?:string};

/** Stable, non-routable placeholder for rows without a public email. */
export function syntheticMapsEmail(placeId:string){
 const safe=placeId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
 if(!safe)throw Error('INVALID_PLACE_ID');
 return `noemail+${safe}@maps.import.local`;
}
export function isSyntheticMapsEmail(value?:string|null){
 return typeof value==='string'&&/^noemail\+[a-z0-9._-]+@maps\.import\.local$/i.test(value.trim());
}
export function validMapsEmail(value?:string|null){
 const parsed=emailText.safeParse(value??'');
 return parsed.success?parsed.data:undefined;
}

function number(value:unknown){if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value==='string'&&value.trim()){const parsed=Number(value);if(Number.isFinite(parsed))return parsed;}return undefined;}

function composeNotes(row:MapsRow,hasRealEmail:boolean){
 const parts:string[]=[];
 if(!hasRealEmail)parts.push(row.email?.trim()?'上游邮箱格式无效，未使用':'无公开邮箱');
 if(row.industry)parts.push('行业：'+row.industry);
 if(row.country)parts.push('国家：'+row.country);
 if(row.city)parts.push('城市：'+row.city);
 if(row.website)parts.push('官网：'+row.website);
 const rating=number(row.rating),reviews=number(row.reviews);
 if(rating!==undefined)parts.push(`评分：${rating}${reviews!==undefined?`（${reviews} 条评价）`:''}`);
 else if(reviews!==undefined)parts.push(`评价数：${reviews}`);
 if(hasRealEmail&&row.emailSource)parts.push('邮箱来源：'+row.emailSource);
 if(row.notes)parts.push(row.notes);
 return parts.join('；').slice(0,20000);
}

/** Pure adapter: no network, database or approval side effects. */
export function mapsRowToLead(input:unknown):MapsLead{
 const row=mapsRowSchema.parse(input);
 const placeId=row.placeId??row.place_id;
 const name=(row.name??'').trim()||placeId;
 if(!name)throw Error('缺少公司名称或 placeId');
 const realEmail=validMapsEmail(row.email);
 const email=realEmail??(placeId?syntheticMapsEmail(placeId):undefined);
 if(!email)throw Error('缺少邮箱或 placeId，无法生成占位邮箱');
 const mapsUrl=(row.mapsUrl??row.maps_url)?.trim();
 const notes=composeNotes(row,Boolean(realEmail));
 return {name,email,source:'maps',
  ...(placeId?{placeId}:{}),
  ...(mapsUrl&&/^https?:\/\//i.test(mapsUrl)?{mapsUrl}:{}),
  ...(notes?{notes}:{}),
  ...(row.address?.trim()?{address:row.address.trim()}:{}),
  ...(row.phone?.trim()?{phone:row.phone.trim()}:{})};
}

const candidateSchema=z.object({
 name:text,email:emailText.optional(),
 source:z.literal('maps').optional(),placeId:placeIdText.optional(),place_id:placeIdText.optional(),
 mapsUrl:z.url().refine(v=>/^https?:/.test(v)).optional(),maps_url:z.url().refine(v=>/^https?:/.test(v)).optional(),
 notes:text.optional(),address:text.optional(),phone:text.optional()
}).strict();
export function normalizeMapsCandidate(input:unknown){
 const candidate=candidateSchema.parse(input);
 return mapsRowToLead({...candidate,source:'maps'});
}
