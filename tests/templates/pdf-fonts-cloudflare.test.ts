import {it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
it('loads Chinese font through ASSETS and renders a real PI',async()=>{
 vi.stubEnv('DEPLOYMENT_TARGET','cloudflare');
 const key=Symbol.for('__cloudflare-context__');const globals=globalThis as unknown as Record<symbol,unknown>;const previous=globals[key];
 const fetch=vi.fn(async()=>new Response(await readFile('assets/fonts/NotoSansSC-Regular.otf')));
 globals[key]={env:{ASSETS:{fetch}}};
 try{const {renderPi}=await import('@/templates/pi');const {buildPiSnapshot}=await import('@/templates/pi-data');const bytes=await renderPi(buildPiSnapshot({id:'CF-TEST',customer:'测试中文客户',quantity:'10',price:'12.50'},1));expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);expect(fetch).toHaveBeenCalledTimes(1);}finally{globals[key]=previous;vi.unstubAllEnvs();}
});
