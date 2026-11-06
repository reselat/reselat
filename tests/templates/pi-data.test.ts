import { it,expect } from 'vitest';
import { buildPiSnapshot } from '@/templates/pi-data';
it('calculates total from exact amounts and freezes source values',()=>{
 const input={id:'DEMO-1',customer:'虚构客户',quantity:'1000',price:'12.50'};
 const snapshot=buildPiSnapshot(input);input.customer='changed';
 expect(snapshot.customer).toBe('虚构客户');expect(snapshot.totalMinor).toBe('1250000');expect(snapshot.lines[0]?.amountMinor).toBe('1250000');
});
it('rejects excessive lines, invalid quantity and missing customer',()=>{
 expect(()=>buildPiSnapshot({id:'x',customer:'',quantity:'1',price:'1'})).toThrow();
 expect(()=>buildPiSnapshot({id:'x',customer:'虚构',quantity:'-1',price:'1'})).toThrow();
 expect(()=>buildPiSnapshot({id:'x',customer:'虚构',quantity:'1',price:'1'},101)).toThrow();
});
