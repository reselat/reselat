import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {validateAuthAdminKey,replaceAdminKey} from '../scripts/auth-admin-config';
it('accepts a server secret, rejects public keys and wrong project legacy keys',()=>{
 expect(validateAuthAdminKey('sb_secret_synthetic_value_for_test_only')).toContain('sb_secret_');
 expect(()=>validateAuthAdminKey('sb_publishable_synthetic')).toThrow('INVALID_ADMIN_KEY');
 const key='a.'+Buffer.from(JSON.stringify({role:'service_role',ref:'another-project'})).toString('base64url')+'.b';expect(()=>validateAuthAdminKey(key)).toThrow();
});
it('preserves other config and never echoes piped input',()=>{
 expect(replaceAdminKey('OTHER="keep"\n','sb_secret_synthetic_value_for_test_only')).toContain('OTHER="keep"');
 const result=spawnSync(process.execPath,['scripts/configure-auth-admin.mjs'],{input:'PRIVATE_TEST_VALUE\n',encoding:'utf8'});expect(result.status).toBe(1);expect(result.stdout+result.stderr).toContain('TTY_REQUIRED');expect(result.stdout+result.stderr).not.toContain('PRIVATE_TEST_VALUE');
});
