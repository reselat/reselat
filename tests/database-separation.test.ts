import {it,expect} from 'vitest';
import {validateDatabaseTarget,readDatabaseTarget,verifyTargetMarker} from '../src/server/db/config';
const identity='abcdefghijklmnopqrst',business='uvwxyzabcdefghijklmn';
const uri=(purpose:string,ref:string)=>`postgresql://${purpose}_backend.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
it('requires distinct projects and explicit purpose-specific roles',()=>{
 expect(validateDatabaseTarget(uri('identity',identity),'identity',identity)).toContain('identity_backend');
 expect(()=>validateDatabaseTarget(uri('business',identity),'identity',identity)).toThrow();
 expect(()=>validateDatabaseTarget(uri('identity',business),'identity',identity)).toThrow();
 expect(()=>validateDatabaseTarget(uri('identity',identity)+'?sslmode=disable','identity',identity)).toThrow();
 expect(()=>readDatabaseTarget('business',{IDENTITY_PROJECT_REF:identity,BUSINESS_PROJECT_REF:identity,BUSINESS_DATABASE_URL:uri('business',identity)})).toThrow();
});
it('does not fall back to a legacy or alternate connection and allows identity-only setup',()=>{
 expect(()=>readDatabaseTarget('business',{TRADE_DATABASE_URL:uri('identity',identity)})).toThrow();
 expect(readDatabaseTarget('identity',{IDENTITY_PROJECT_REF:identity,IDENTITY_DATABASE_URL:uri('identity',identity)}).projectRef).toBe(identity);
 expect(readDatabaseTarget('business',{IDENTITY_PROJECT_REF:identity,BUSINESS_PROJECT_REF:business,BUSINESS_DATABASE_URL:uri('business',business)}).projectRef).toBe(business);
});
it('rejects an unexpected, missing, or ambiguous deployment marker',()=>{
 expect(()=>verifyTargetMarker([],'identity',identity)).toThrow();
 expect(()=>verifyTargetMarker([{purpose:'business',project_ref:identity}],'identity',identity)).toThrow();
 expect(()=>verifyTargetMarker([{purpose:'identity',project_ref:business}],'identity',identity)).toThrow();
 expect(()=>verifyTargetMarker([{purpose:'identity',project_ref:identity}],'identity',identity)).not.toThrow();
});
