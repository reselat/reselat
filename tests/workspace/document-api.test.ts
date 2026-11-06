import {it,expect,vi,beforeEach,afterEach} from 'vitest';
beforeEach(()=>vi.stubEnv('NODE_ENV','development'));afterEach(()=>vi.unstubAllEnvs());
import {POST} from '@/app/api/demo/documents/route';
it('accepts loopback origin matched to Host when Next uses localhost internally',async()=>{
 const r=await POST(new Request('http://localhost:3000/api/demo/documents',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'},body:'{}'}));expect(r.status).toBe(400);
});
it('rejects cross origin and public hosts',async()=>{
 expect((await POST(new Request('https://public.example/api/demo/documents',{method:'POST',body:'{}'}))).status).toBe(403);
 expect((await POST(new Request('http://127.0.0.1:3000/api/demo/documents',{method:'POST',headers:{origin:'https://untrusted.example'},body:'{}'}))).status).toBe(403);
});
