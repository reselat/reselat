import { it,expect } from 'vitest';
import { GET } from '@/app/api/orders/route';
it('fails closed when real identity and persistence are not configured',async()=>{
 const response=await GET();expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'SERVICE_NOT_CONFIGURED'});
 expect(response.headers.get('cache-control')).toBe('no-store');
});
