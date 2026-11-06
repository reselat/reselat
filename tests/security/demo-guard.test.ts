import {afterEach,expect,it,vi} from 'vitest';
import {localDemoGuard} from '@/server/auth/local-demo';
afterEach(()=>vi.unstubAllEnvs());
it('rejects production before any local host exception',()=>{vi.stubEnv('NODE_ENV','production');for(const host of ['localhost','127.0.0.1','[::1]','example.com'])expect(localDemoGuard(new Request('http://localhost/api/demo/pi',{headers:{host}}))?.status).toBe(403);});
it('allows only development loopback and matching origins',()=>{vi.stubEnv('NODE_ENV','development');expect(localDemoGuard(new Request('http://localhost:3000/api/demo/pi',{headers:{host:'localhost:3000',origin:'http://localhost:3000'}}))).toBeUndefined();for(const headers of [{host:'example.com'},{host:'localhost:3000',origin:'https://evil.test'},{host:'['}] as Record<string,string>[])expect(localDemoGuard(new Request('http://localhost/api/demo/pi',{headers}))?.status).toBe(403);});
