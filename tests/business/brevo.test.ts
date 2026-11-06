import {it,expect,vi,afterEach} from 'vitest';
import {sendBrevo} from '@/server/business/brevo';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('requires server configuration before network access',async()=>{
 vi.stubEnv('BREVO_API_KEY','');
 await expect(sendBrevo({email:'buyer@example.com',subject:'Hi',body:'Hello',tags:[]})).rejects.toThrow('BREVO_CONFIG_REQUIRED');
});
it('returns transactional receipt using mocked transport',async()=>{
 vi.stubEnv('BREVO_API_KEY','fixture');vi.stubEnv('BREVO_SENDER_EMAIL','sender@example.com');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({messageId:'receipt'})}));
 expect(await sendBrevo({email:'buyer@example.com',subject:'Hi',body:'Hello',tags:[]})).toBe('receipt');
});
