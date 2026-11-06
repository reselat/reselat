import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {parseSeparatedOwner,replaceSeparatedEnv,parseLocalEnv} from '../scripts/separated-setup';
const ref='qgbsikqgunmsipegkvda';
const raw=`postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
it('checks the requested project and refuses override parameters and incorrect owners',()=>{
 expect(parseSeparatedOwner(raw,ref).hostname).toContain('pooler');
 expect(()=>parseSeparatedOwner(raw,'abcdefghijklmnopqrst')).toThrow();
 expect(()=>parseSeparatedOwner(raw+'?user=postgres',ref)).toThrow();
 expect(()=>parseSeparatedOwner(raw.replace('5432','6543'),ref)).toThrow();
 expect(()=>parseSeparatedOwner(raw.replace('postgres.','identity_backend.'),ref)).toThrow();
});
it('keeps separate purpose keys without overwriting unrelated configuration',()=>{
 const text=replaceSeparatedEnv('OTHER="keep"\n', 'identity',{projectRef:ref,url:raw,caPath:'/synthetic/ca'});
 expect(parseLocalEnv(text).IDENTITY_PROJECT_REF).toBe(ref);expect(parseLocalEnv(text).OTHER).toBe('keep');expect(parseLocalEnv(text).BUSINESS_DATABASE_URL).toBeUndefined();
});
it('refuses piped credentials and never echoes them',()=>{const result=spawnSync(process.execPath,['scripts/configure-separated-databases.mjs','--purpose','identity','--project-ref',ref],{input:'PRIVATE_TEST_PASSWORD\n',encoding:'utf8'});expect(result.status).toBe(1);expect(result.stdout+result.stderr).toContain('TTY_REQUIRED');expect(result.stdout+result.stderr).not.toContain('PRIVATE_TEST_PASSWORD');});
it('rejects non-string parsed env values rather than misreading project configuration',()=>{
 expect(()=>parseLocalEnv('IDENTITY_PROJECT_REF="valid"garbage')).toThrow('LOCAL_CONFIG_INVALID');
});
it('cleans only its own definitely uncommitted temporary config and preserves ambiguous outcomes',async()=>{
 const {canDiscardSetupTemp}=await import('../scripts/separated-setup');
 expect(canDiscardSetupTemp({code:'42501'},'configure_role',false)).toBe(true);
 expect(canDiscardSetupTemp({code:'42P18'},'configure_role',false)).toBe(true);
 expect(canDiscardSetupTemp({code:'ECONNRESET'},'configure_role',false)).toBe(false);
 expect(canDiscardSetupTemp({code:'42501'},'verify',true)).toBe(false);
});
it('removes a definitely rolled-back owned temp but never an unknown or pre-existing file',async()=>{
 const {cleanupOwnedSetupTemp}=await import('../scripts/separated-setup');const calls:string[]=[];
 const unlink=async()=>{calls.push('removed');};
 await cleanupOwnedSetupTemp({code:'42501'},'configure_role',false,true,unlink);
 expect(calls).toEqual(['removed']);calls.length=0;
 await cleanupOwnedSetupTemp({code:'ECONNRESET'},'configure_role',false,true,unlink);
 await cleanupOwnedSetupTemp({code:'42501'},'configure_role',false,false,unlink);
 expect(calls).toEqual([]);
});
