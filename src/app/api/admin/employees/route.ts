import {requireEmployee} from '@/server/auth/session';
import {sameOrigin} from '@/server/auth/http';
import {parseMemberChange} from '@/server/admin/member-domain';
import {listMembers,mutateMember} from '@/server/admin/members';
import {adminError} from '@/server/admin/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const {employee}=await requireEmployee(true);return Response.json(await listMembers(employee,new URL(request.url).searchParams),{headers:{'cache-control':'no-store'}});}catch(e){return adminError(e);}}
export async function PATCH(request:Request){try{sameOrigin(request);const {employee}=await requireEmployee(true);const text=await request.text();if(text.length>4096)throw new Error('INVALID_INPUT');const changed=await mutateMember(employee,parseMemberChange(JSON.parse(text)));return Response.json({ok:changed,code:changed?'UPDATED':'VERSION_CONFLICT',...(!changed?{message:'成员资料已变更，请刷新后重试。'}:{})},{status:changed?200:409,headers:{'cache-control':'no-store'}});}catch(e){return adminError(e);}}
