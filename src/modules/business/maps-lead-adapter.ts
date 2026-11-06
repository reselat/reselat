import {z} from 'zod';
const text=z.string().trim().min(1).max(20000);
const candidate=z.object({
 name:text,email:z.string().trim().pipe(z.email()).transform(v=>v.toLowerCase()),
 source:z.literal('maps').optional(),placeId:text.optional(),place_id:text.optional(),
 mapsUrl:z.url().refine(v=>/^https?:/.test(v)).optional(),maps_url:z.url().refine(v=>/^https?:/.test(v)).optional(),
 notes:text.optional(),address:text.optional(),phone:text.optional()
}).strict();
/** Pure adapter: no network, database or approval side effects. */
export function normalizeMapsCandidate(input:unknown){
 const p=candidate.parse(input);
 return {name:p.name,email:p.email,source:'maps' as const,
 ...(p.placeId??p.place_id?{placeId:p.placeId??p.place_id}:{}),
 ...(p.mapsUrl??p.maps_url?{mapsUrl:p.mapsUrl??p.maps_url}:{}),
 ...(p.notes?{notes:p.notes}:{}),...(p.address?{address:p.address}:{}),...(p.phone?{phone:p.phone}:{})};
}
