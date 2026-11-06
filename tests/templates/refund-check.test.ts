import {it,expect} from 'vitest';
import {mkdir,writeFile} from 'node:fs/promises';
import {renderRefundCheck} from '@/templates/refund-check';
it('renders refund checklist with Chinese text',async()=>{
 const bytes=await renderRefundCheck({orderId:'00000000-0000-4000-8000-000000000001',orderNo:'TEST-REFUND',createdAt:'2026-10-23T00:00:00Z',complete:false,warnings:['采购进项发票待补齐'],items:[{key:'purchase_invoice',label:'采购进项发票',status:'missing',version:1,reference:'TEST-001',reason:'等待资料复核',fileIds:[]}],files:[]});
 expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);await mkdir('artifacts/pdf',{recursive:true});await writeFile('artifacts/pdf/refund-check.pdf',bytes);
});
