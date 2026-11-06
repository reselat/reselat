import { describe,it,expect } from 'vitest';
import { parseDecimal } from '@/domain/decimal';
import { assertAvailable } from '@/domain/quantities';
describe('quantity validation',()=>{
 it('preserves exact fixed precision',()=>{expect(parseDecimal('100.125',3)).toBe(100125n);expect(parseDecimal('0.1',4)).toBe(1000n);});
 it.each(['-1','NaN','1e2','0.00001','','1.2.3'])('rejects invalid quantity %s',v=>{expect(()=>parseDecimal(v,4)).toThrow();});
 it('allows exact remaining quantity',()=>{expect(()=>assertAvailable(100n,100n)).not.toThrow();});
 it('rejects over-allocation and non-positive requests',()=>{expect(()=>assertAvailable(101n,100n)).toThrow();expect(()=>assertAvailable(0n,100n)).toThrow();expect(()=>assertAvailable(-1n,100n)).toThrow();expect(()=>assertAvailable(1n,-1n)).toThrow();});
});
