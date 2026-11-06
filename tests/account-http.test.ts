import {it,expect,vi,beforeEach} from 'vitest';
import {sameOrigin,accountError} from '@/server/auth/http';
import {IdentityError} from '@/server/auth/employee';
beforeEach(()=>{vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3000');});
it('rejects cross-origin and absent origin writes',()=>{expect(()=>sameOrigin(new Request('http://127.0.0.1:3000/api/account/login'))).toThrow();expect(()=>sameOrigin(new Request('http://127.0.0.1:3000/api/account/login',{headers:{origin:'https://other.example.test'}}))).toThrow();expect(()=>sameOrigin(new Request('http://127.0.0.1:3000/api/account/login',{headers:{origin:'http://127.0.0.1:3000'}}))).not.toThrow();});
it('fails closed without returning internal errors or sensitive details',async()=>{expect(accountError(new IdentityError('UNAUTHENTICATED')).status).toBe(401);expect(accountError(new IdentityError('FORBIDDEN')).status).toBe(403);expect(accountError(new IdentityError('NOT_CONFIGURED')).status).toBe(503);const response=accountError(new Error('PRIVATE TEST DETAILS'));expect(await response.text()).not.toContain('PRIVATE TEST DETAILS');expect(response.headers.get('cache-control')).toBe('no-store');});
