import { it,expect } from 'vitest';
import { mkdir,writeFile } from 'node:fs/promises';
import { buildPiSnapshot } from '@/templates/pi-data';
import { renderPi } from '@/templates/pi';
it('renders bilingual one-page and multi-page samples with a PDF header',async()=>{
 await mkdir('artifacts/pdf',{recursive:true});
 for(const count of [1,100]){
  const snapshot=buildPiSnapshot({id:'SAMPLE-'+count,customer:'虚构客户 Northstar',quantity:'10',price:'12.50'},count);
  const bytes=await renderPi(snapshot);
  expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(1000);
  await writeFile('artifacts/pdf/pi-'+count+'.pdf',bytes);
 }
});
