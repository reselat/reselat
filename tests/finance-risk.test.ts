import {describe,expect,it} from 'vitest';
import {convertMinor,analyseCosts,costPlanInput,costCategories} from '@/modules/finance/costs';
describe('order cost and risk arithmetic',()=>{
 it('converts currencies with their own scales and rounds only once',()=>{
  expect(convertMinor('100','JPY','USD','0.0067')).toBe('67');
  expect(convertMinor('10000','CNY','USD','0.14')).toBe('1400');
  expect(()=>convertMinor('100','USD','USD','1.1')).toThrow();
 });
 it('shows purchase and freight erosion without double counting commitments',()=>{
  const result=analyseCosts({revenueMinor:'10000',baselineRevenueMinor:'10000',baseline:{purchase:'5000',production:'0',logistics:'1000',customs:'0',insurance:'0',bank:'0',commission:'0',other:'0'},forecast:{purchase:'6000',production:'0',logistics:'4500',customs:'0',insurance:'0',bank:'0',commission:'0',other:'0'},committed:{purchase:'5500',logistics:'2000'},unknown:[],minimumMarginBps:1000});
  expect(result.forecastCostMinor).toBe('10500');expect(result.forecastProfitMinor).toBe('-500');
  expect(result.profitChangeMinor).toBe('-4500');
  expect(result.risks.map(r=>r.code)).toEqual(expect.arrayContaining(['PROJECTED_LOSS','COST_INCREASE_purchase','COST_INCREASE_logistics']));
 });
 it('never claims profit when an FX rate or a material cost is missing',()=>{
  const amounts={purchase:'5000',production:'0',logistics:'0',customs:'0',insurance:'0',bank:'0',commission:'0',other:'0'};
  const result=analyseCosts({revenueMinor:'10000',baselineRevenueMinor:'10000',baseline:amounts,forecast:amounts,committed:{},unknown:['logistics','FX:CNY'],minimumMarginBps:1000});
  expect(result.forecastProfitMinor).toBeNull();expect(result.risks.map(r=>r.code)).toContain('COST_DATA_MISSING');
  const knownLoss=analyseCosts({revenueMinor:'10000',baselineRevenueMinor:'10000',baseline:amounts,forecast:amounts,committed:{purchase:'12000'},unknown:['logistics'],minimumMarginBps:1000});expect(knownLoss.forecastProfitMinor).toBeNull();expect(knownLoss.risks.find(r=>r.code==='CONFIRMED_COST_EXCEEDS_REVENUE')?.level).toBe('critical');
  const unknownBaseline=analyseCosts({revenueMinor:'10000',baselineRevenueMinor:'10000',baseline:amounts,forecast:amounts,committed:{},unknown:[],baselineUnknown:['logistics'],minimumMarginBps:1000});expect(unknownBaseline.baselineProfitMinor).toBeNull();expect(unknownBaseline.profitChangeMinor).toBeNull();
 });
 it('rejects excessive precision and duplicate cost categories',()=>{
  expect(()=>convertMinor('1','CNY','USD','0.1234567')).toThrow();
  const valid={requestId:crypto.randomUUID(),orderId:crypto.randomUUID(),expectedVersion:0,evidenceFingerprint:'a'.repeat(64),reason:'SYNTHETIC',rates:[],items:costCategories.map(category=>({category,amount:'1',certainty:'confirmed' as const})),quoteValidUntil:'2026-11-27',freightValidUntil:'2026-11-27',minimumMarginBps:1000};
  expect(costPlanInput.safeParse(valid).success).toBe(true);
  const duplicate={...valid,items:valid.items.map((item,i)=>i===7?{...item,category:'purchase'}:item)};expect(costPlanInput.safeParse(duplicate).success).toBe(false);
 });
});
