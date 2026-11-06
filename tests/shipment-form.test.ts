import {expect,it} from 'vitest';
import {prepareShipment,calculateCbm} from '@/modules/business/shipment-form';
const detail={order:{id:'00000000-0000-4000-8000-000000000001'},lines:[{id:'00000000-0000-4000-8000-000000000002',snapshot:{description:'Synthetic product'}}],receipts:[{id:'00000000-0000-4000-8000-000000000003',orderLineId:'00000000-0000-4000-8000-000000000002',available:'2'}]};
function form(){const data=new FormData();for(const [key,value] of Object.entries({date:'2026-10-26',portLoad:'shanghai',portDischarge:'qingdao',transport:'SEA',source_00000000_0000:'0'}))data.set(key,value);const id=detail.lines[0].id;data.set('source_'+detail.receipts[0].id,'1');for(const [key,value] of Object.entries({packages:'1',netKg:'3',grossKg:'4',cbm:'0.027',marks:'',dimensions:'30*30*30'}))data.set(key+'_'+id,value);return data;}
it('explains missing or fully allocated receipts instead of submitting an empty shipment',()=>{
 expect(()=>prepareShipment({...detail,receipts:[]},form())).toThrow('到货');
 expect(()=>prepareShipment({...detail,receipts:[{...detail.receipts[0],available:'0'}]},form())).toThrow('可用');
});
it('requires a selected quantity and names invalid packing fields',()=>{
 const none=form();none.set('source_'+detail.receipts[0].id,'0');expect(()=>prepareShipment(detail,none)).toThrow('出运数量');
 const zero=form();zero.set('cbm_'+detail.lines[0].id,'0');expect(()=>prepareShipment(detail,zero)).toThrow('CBM');
 const weight=form();weight.set('grossKg_'+detail.lines[0].id,'2');expect(()=>prepareShipment(detail,weight)).toThrow('毛重');
 const excess=form();excess.set('source_'+detail.receipts[0].id,'3');expect(()=>prepareShipment(detail,excess)).toThrow('可用');
});
it('prepares complete, exact source allocations from valid user input',()=>{const input=prepareShipment(detail,form());expect(input.lines[0]).toMatchObject({quantity:'1.0000',netKg:'3',grossKg:'4',cbm:'0.027',sources:[{receiptLineId:detail.receipts[0].id,quantity:'1'}]});expect(input.portLoad).toBe('shanghai');});
it('calculates cubic metres using explicit centimetre dimensions and package count',()=>{
 expect(calculateCbm('30*30*30','1')).toBe('0.0270');expect(calculateCbm('30 × 30 × 30 cm','2')).toBe('0.0540');
 expect(()=>calculateCbm('30*30','1')).toThrow();expect(()=>calculateCbm('30*30*30','0')).toThrow();
});
