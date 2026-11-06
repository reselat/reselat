import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
it('refuses noninteractive credential input and never echoes supplied secrets',()=>{const input='postgres://PRIVATE_TEST_VALUE@wrong.example.test/database\n';const result=spawnSync(process.execPath,['scripts/configure-database.mjs'],{input,encoding:'utf8'});expect(result.status).toBe(1);expect(result.stdout+result.stderr).not.toContain('PRIVATE_TEST_VALUE');expect(result.stdout+result.stderr).not.toContain('wrong.example.test');});
