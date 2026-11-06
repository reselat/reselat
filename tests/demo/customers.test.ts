import { it, expect } from 'vitest';
import { validateCustomerDraft, filterCustomers, validateFollowup } from '@/modules/demo/customer-rules';
it('rejects blank companies and impossible followup dates',()=>{
 expect(validateCustomerDraft({name:' ',country:'加拿大',city:'',note:'',next:'2026-02-30'}).success).toBe(false);
 expect(validateCustomerDraft({name:'虚构客户',country:'加拿大',city:'',note:'',next:'2026-02-30'}).success).toBe(false);
});
it('accepts a valid draft and trims text',()=>{
 const result=validateCustomerDraft({name:' 演示公司 ',country:'加拿大',city:'温哥华',note:'测试',next:'2026-11-01'});
 expect(result.success).toBe(true);if(result.success)expect(result.data.name).toBe('演示公司');
});
it('finds a company with case insensitive search',()=>{
 const rows=[{name:'Northstar',country:'加拿大',city:'温哥华'},{name:'Harbor',country:'澳大利亚',city:'悉尼'}];
 expect(filterCustomers(rows,'NORTH')).toEqual([rows[0]]);expect(filterCustomers(rows,'悉尼')).toEqual([rows[1]]);
});
it('requires actual followup notes',()=>{expect(validateFollowup('   ').success).toBe(false);expect(validateFollowup('已确认演示包装').success).toBe(true);});
