import {expect,it} from 'vitest';
import {suggestCustomerStage,customerStage} from '@/modules/business/customer-stage';
it('keeps intention manual and suggests categories from completed order history only',()=>{
 expect(customerStage.options).toHaveLength(6);expect(suggestCustomerStage([]).suggestedStage).toBeNull();
 expect(suggestCustomerStage([{day:'2025-01-01',sample:true}]).suggestedStage).toBe('walk_in');
 expect(suggestCustomerStage([{day:'2025-01-01',sample:false},{day:'2026-01-01',sample:false}]).suggestedStage).toBe('regular');
 expect(suggestCustomerStage([{day:'2025-01-01',sample:false},{day:'2025-06-01',sample:false},{day:'2026-01-02',sample:false}]).suggestedStage).toBe('key_account');
 expect(suggestCustomerStage([{day:'2025-01-01',sample:false},{day:'2025-01-02',sample:false},{day:'2025-01-03',sample:false}]).suggestedStage).toBe('regular');
});
