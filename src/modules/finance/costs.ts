import {z} from 'zod';
import {parseDecimal} from '@/domain/decimal';
import {currencyScale} from '@/modules/workspace/model';
import {currency,date,uuid,version,decimal} from '@/modules/business/schemas';
export const costCategories=['purchase','production','logistics','customs','insurance','bank','commission','other'] as const;
export type CostCategory=typeof costCategories[number];
export const costLabels:Record<CostCategory,string>={purchase:'采购成本',production:'生产追加成本',logistics:'物流运输',customs:'报关及港杂',insurance:'保险',bank:'银行手续费',commission:'佣金',other:'其他费用'};
export const expenseCategory=z.enum(['production','logistics','customs','insurance','bank','commission','other']);
export const costPlanInput=z.object({requestId:uuid,orderId:uuid,expectedVersion:z.number().int().min(0),evidenceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(1000),rates:z.array(z.object({currency,rate:z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/).refine(v=>parseDecimal(v,6)>0n)}).strict()).max(6),items:z.array(z.object({category:z.enum(costCategories),amount:decimal,certainty:z.enum(['estimated','confirmed','unknown'])}).strict()).length(8),quoteValidUntil:date,freightValidUntil:date,minimumMarginBps:z.number().int().min(0).max(10000)}).strict().superRefine((value,ctx)=>{if(new Set(value.items.map(i=>i.category)).size!==8||new Set(value.rates.map(r=>r.currency)).size!==value.rates.length)ctx.addIssue({code:'custom',message:'Duplicate category or currency'});});
export const costPlanSnapshot=z.object({sourceVersion:version,currency,revenueMinor:z.string().regex(/^\d+$/),confirmedCostHash:z.string().regex(/^[a-f0-9]{64}$/),items:costPlanInput.shape.items,rates:costPlanInput.shape.rates,quoteValidUntil:date,freightValidUntil:date,minimumMarginBps:z.number().int()}).strict();
export function convertMinor(amount:string,from:z.infer<typeof currency>,to:z.infer<typeof currency>,rate:string){
 if(!/^\d{1,38}$/.test(amount))throw new Error('DECIMAL_PRECISION');
 if(!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/.test(rate))throw new Error('DECIMAL_PRECISION');
 const r=parseDecimal(rate,6);if(r<=0n||(from===to&&r!==1000000n))throw new Error('CURRENCY_MISMATCH');
 const numerator=BigInt(amount)*r*10n**BigInt(currencyScale[to]),denominator=1000000n*10n**BigInt(currencyScale[from]);
 const result=((numerator+denominator/2n)/denominator).toString();if(result.length>38)throw new Error('DECIMAL_PRECISION');return result;
}
export type Risk={code:string;level:'warning'|'critical';stage:string;title:string;advice:string};
export function analyseCosts(input:{revenueMinor:string;baselineRevenueMinor:string;baseline:Record<CostCategory,string>;forecast:Record<CostCategory,string>;committed:Partial<Record<CostCategory,string>>;unknown:string[];baselineUnknown?:string[];minimumMarginBps:number}){
 let baseline=0n,forecast=0n,committed=0n;const risks:Risk[]=[];
 for(const category of costCategories){const b=BigInt(input.baseline[category]),f=BigInt(input.forecast[category]),c=BigInt(input.committed[category]??'0');baseline+=b;forecast+=f>c?f:c;committed+=c;
  if((f>c?f:c)>b)risks.push({code:'COST_INCREASE_'+category,level:'warning',stage:category==='logistics'?'订舱出运':category==='purchase'||category==='production'?'采购生产':'费用归集',title:costLabels[category]+'超过报价预算',advice:'核对供应商或服务商的新报价、有效期及费用承担方，再确认变更和客户补价方案。'});
 }
 const revenue=BigInt(input.revenueMinor),baselineProfit=BigInt(input.baselineRevenueMinor)-baseline,profit=revenue-forecast;
 if(committed>revenue)risks.push({code:'CONFIRMED_COST_EXCEEDS_REVENUE',level:'critical',stage:'成本复核',title:'已确认成本已超过订单收入',advice:'即使其余费用仍待核对，已确认承诺也已超过当前销售收入，请立即提交管理员复核追加承诺与客户调整方案。'});
 if(input.unknown.includes('CONFIRMED_COSTS_CHANGED'))risks.push({code:'COST_REVIEW_REQUIRED',level:'warning',stage:'费用与成本变更',title:'已确认成本发生变化，需重新复核利润',advice:'核对新采购或报销是预算内费用还是额外增量，补齐全部预计成本后保存新版本，避免漏算或重复计算。'});
 if(input.unknown.some(item=>item!=='CONFIRMED_COSTS_CHANGED'))risks.push({code:'COST_DATA_MISSING',level:'warning',stage:'报价与成本复核',title:'成本或折算资料不完整，暂不能判断利润',advice:'补齐未确认成本和所需汇率；未知项不能按零成本作为利润依据。'});
 if(!input.unknown.length&&profit<0n)risks.push({code:'PROJECTED_LOSS',level:'critical',stage:'订单履约',title:'订单预计亏损',advice:'暂停新增不可撤销承诺，提交管理员复核采购、物流及客户价格调整方案。'});
 else if(!input.unknown.length&&revenue>0n&&profit*10000n<revenue*BigInt(input.minimumMarginBps))risks.push({code:'LOW_MARGIN',level:'warning',stage:'订单履约',title:'预计利润率低于预警线',advice:'复核未锁价成本、汇率和附加费用，确认是否需要调整报价或履约方案。'});
 if(revenue===0n)risks.push({code:'ZERO_REVENUE',level:'warning',stage:'报价',title:'订单收入为零',advice:'确认是否为样品或赠送订单，并单独确认费用承担。'});
 return {baselineCostMinor:baseline.toString(),forecastCostMinor:forecast.toString(),committedCostMinor:committed.toString(),baselineProfitMinor:input.baselineUnknown?.length?null:baselineProfit.toString(),forecastProfitMinor:input.unknown.length?null:profit.toString(),profitChangeMinor:input.unknown.length||input.baselineUnknown?.length?null:(profit-baselineProfit).toString(),marginBps:input.unknown.length||revenue===0n?null:(profit*10000n/revenue).toString(),unknown:input.unknown,risks};
}
