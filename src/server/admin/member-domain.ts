import {z} from 'zod';
export const roleSchema=z.enum(['admin','sales','operations']);
const fields={id:z.string().uuid(),version:z.number().int().positive()};
export const memberChangeSchema=z.union([
 z.object({...fields,action:z.enum(['archive','restore'])}).strict(),
 z.object({...fields,name:z.string().trim().min(1).max(80).optional(),role:roleSchema.optional(),enabled:z.boolean().optional()}).strict().refine(v=>v.name!==undefined||v.role!==undefined||v.enabled!==undefined)
]);
export type MemberChange=z.infer<typeof memberChangeSchema>;
export const parseMemberChange=(value:unknown)=>memberChangeSchema.parse(value);
export function memberPatch(current:{enabled:boolean;archivedAt:string|null},change:MemberChange,actorId:string,subjectId:string){
 if('action' in change){
  if(change.action==='archive'){if(actorId===subjectId)throw new Error('SELF_ARCHIVE_FORBIDDEN');return {enabled:false,archived:true};}
  if(!current.archivedAt)throw new Error('NOT_ARCHIVED');
  return {enabled:false,archived:false};
 }
 if(current.archivedAt)throw new Error('ARCHIVED_MEMBER');
 return {enabled:change.enabled??current.enabled,archived:false};
}
export const createMemberSchema=z.object({requestId:z.string().uuid(),name:z.string().trim().min(1).max(80),email:z.email().max(254),password:z.string().min(12).max(128),role:roleSchema}).strict();
export type CreateMember=z.infer<typeof createMemberSchema>;
