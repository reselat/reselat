import {expect,it} from 'vitest';
import {financeEvent,aiRequest,requireIntegrationEnabled} from '../src/server/integrations/contracts';
const id='00000000-0000-4000-8000-000000000001';
const base={schemaVersion:1,eventId:id,companyId:id,type:'payment.confirmed',paymentId:id,orderId:id,kind:'sale',currency:'USD',amountMinor:'123',businessDate:'2026-10-25',reference:'TEST',version:1,occurredAt:'2026-10-25T00:00:00Z'};
it('requires exact money strings and explicit reversal references in finance events',()=>{
 expect(financeEvent.parse(base).amountMinor).toBe('123');
 expect(()=>financeEvent.parse({...base,amountMinor:1.23})).toThrow();
 expect(()=>financeEvent.parse({...base,type:'payment.voided'})).toThrow();
 expect(financeEvent.parse({...base,type:'payment.voided',reversalOf:id}).reversalOf).toBe(id);
});
it('bounds AI context and rejects unsolicited provider or database configuration',()=>{
 const input={schemaVersion:1,companyId:id,actorId:id,task:'summarize_order',requestId:id,context:[]};
 expect(aiRequest.parse(input).context).toEqual([]);
 expect(()=>aiRequest.parse({...input,databaseUrl:'secret'})).toThrow();
 expect(()=>aiRequest.parse({...input,context:[{sourceId:id,sourceVersion:1,text:'x'.repeat(20001)}]})).toThrow();
 expect(()=>requireIntegrationEnabled()).toThrow('INTEGRATION_DISABLED');
});
