import {it,expect} from 'vitest';
import {canArchive,memberState,checkedJson,type Member} from '../src/modules/account/admin/types';
const member:Member={id:'00000000-0000-4000-8000-000000000001',name:'Synthetic',role:'admin',enabled:true,version:1,createdAt:'2026-01-01',archivedAt:null};
it('labels archive explicitly and prevents last admin or self removal',()=>{expect(canArchive(member,member.id,3)).toBe(false);expect(canArchive(member,'other',1)).toBe(false);expect(canArchive({...member,role:'sales'},'other',1)).toBe(true);expect(memberState({...member,archivedAt:'2026-01-01',enabled:false})).toBe('已归档');});
it('never renders arbitrary API error messages',async()=>{await expect(checkedJson(Response.json({code:'UNKNOWN',message:'PRIVATE'},{status:400}))).rejects.not.toThrow('PRIVATE');});
