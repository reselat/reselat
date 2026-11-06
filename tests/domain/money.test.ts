import { describe, it, expect } from 'vitest';
import { lineAmountMinor, formatMinor } from '@/domain/money';
describe('exact money', () => {
 it.each([['3','0.10',2,30n],['1','1.005',2,101n],['1','1.5',0,2n],['0.5','0.333',3,167n],['0','999',2,0n],['1','9007199254740993.01',2,900719925474099301n]] as const)('calculates %s × %s at scale %i', (q,p,s,want)=>{expect(lineAmountMinor(q,p,s)).toBe(want);});
 it.each(['-1','NaN','1e3','Infinity','',' 1','1.'])('rejects invalid quantity %s',q=>{expect(()=>lineAmountMinor(q,'1',2)).toThrow();});
 it('rejects unsupported currency precision',()=>{expect(()=>lineAmountMinor('1','1',10)).toThrow();});
 it('formats integers without Number conversion',()=>{expect(formatMinor(900719925474099301n,2)).toBe('9007199254740993.01');expect(formatMinor(12n,0)).toBe('12');expect(formatMinor(1n,3)).toBe('0.001');});
});
