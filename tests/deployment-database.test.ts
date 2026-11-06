import {expect,it} from 'vitest';
import {readDatabaseTarget,validateDatabaseTarget} from '../src/server/db/config';
const identity='abcdefghijklmnopqrst';
const business='uvwxyzabcdefghijklmn';
const pool=(purpose:string,ref:string,port=6543)=>`postgresql://${purpose}_backend.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:${port}/postgres`;

it('accepts transaction poolers for each independent runtime role',()=>{
 expect(validateDatabaseTarget(pool('identity',identity),'identity',identity)).toBe(pool('identity',identity));
 expect(readDatabaseTarget('business',{IDENTITY_PROJECT_REF:identity,BUSINESS_PROJECT_REF:business,BUSINESS_DATABASE_URL:pool('business',business)}).projectRef).toBe(business);
});

it('keeps project, role, host, TLS override and direct port restrictions',()=>{
 for(const raw of [pool('business',identity),pool('identity',business),pool('identity',identity,6432),pool('identity',identity)+'?sslmode=disable',pool('identity',identity).replace('.pooler.supabase.com','.pooler.supabase.com.example.test'),`postgresql://identity_backend:synthetic@db.${identity}.supabase.co:6543/postgres`]){
  expect(()=>validateDatabaseTarget(raw,'identity',identity)).toThrow('NOT_CONFIGURED');
 }
});
