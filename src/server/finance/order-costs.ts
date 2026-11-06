import {createHash} from 'node:crypto';
import {z} from 'zod';
import {parseDecimal} from '@/domain/decimal';
import {currencyScale} from '@/modules/workspace/model';
import {currency,date,uuid} from '@/modules/business/schemas';
import {analyseCosts,convertMinor,costCategories,costPlanInput,costPlanSnapshot,type CostCategory,type Risk} from '@/modules/finance/costs';
import {checkAdmin} from '@/server/auth/employee';
import {audit,runBusinessCommand,type BusinessTx} from '@/server/business/commands';
import {expectVersion,lookupOrder,readBusiness,type OrderRow} from '@/server/business/order-data';
import type {BusinessActor} from '@/server/business/access';
const businessDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
const planRow=z.object({version:z.number().int(),snapshot:costPlanSnapshot,reason:z.string(),createdAt:z.string()});
const zero=():Record<CostCategory,string>=>({purchase:'0',production:'0',logistics:'0',customs:'0',insurance:'0',bank:'0',commission:'0',other:'0'});
export async function saveCostPlan(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=costPlanInput.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'cost.plan',payload:input},async tx=>{
 const order=await lookupOrder(tx,actor,input.orderId,'confirm');if(order.state==='cancelled')throw new Error('INVALID_TRANSITION');
 const old=await tx`select version,snapshot from trade_business.order_cost_plans where company_id=${actor.companyId} and order_id=${order.id} order by version desc limit 1`;
 expectVersion(old.length?Number(old[0].version):0,input.expectedVersion);
 const evidence=await orderCosts(tx,actor,order,businessDay());if(evidence.fingerprint!==input.evidenceFingerprint)throw new Error('VERSION_CONFLICT');
 if(old.length&&costPlanSnapshot.parse(old[0].snapshot).currency!==order.currency)throw new Error('CURRENCY_MISMATCH');
 for(const rate of input.rates)if(rate.currency===order.currency&&parseDecimal(rate.rate,6)!==1000000n)throw new Error('CURRENCY_MISMATCH');
 for(const item of input.items)parseDecimal(item.amount,currencyScale[order.currency]);
 const snapshot=costPlanSnapshot.parse({currency:order.currency,revenueMinor:order.totalMinor,sourceVersion:order.sourceVersion,confirmedCostHash:evidence.confirmedCostHash,items:input.items,rates:input.rates,quoteValidUntil:input.quoteValidUntil,freightValidUntil:input.freightValidUntil,minimumMarginBps:input.minimumMarginBps});
 await tx`insert into trade_business.order_cost_plans(company_id,order_id,version,snapshot,reason,created_by) values(${actor.companyId},${order.id},${input.expectedVersion+1},${tx.json(snapshot)},${input.reason},${actor.id})`;
 await audit(tx,actor,order.id,'cost.plan',{version:input.expectedVersion+1});return {id:order.id,version:input.expectedVersion+1};
 });}
async function orderCosts(tx:BusinessTx,actor:BusinessActor,order:OrderRow,today:string){
 const raw=await tx`select version,snapshot,reason,created_at::text as "createdAt" from trade_business.order_cost_plans where company_id=${actor.companyId} and order_id=${order.id} order by version`;
 const versions=raw.map(r=>planRow.parse(r)),baseline=versions[0],latest=versions.at(-1),risks:Risk[]=[];
 const commitments=await tx`select 'purchase'::text as category,currency,sum(total_minor)::text as amount from trade_business.purchase_orders where company_id=${actor.companyId} and order_id=${order.id} and state='confirmed' group by currency union all select category,currency,sum(amount_minor)::text as amount from trade_business.expense_claims where company_id=${actor.companyId} and order_id=${order.id} and kind='reimbursement' and state in ('approved','paid') group by category,currency`;
 const stableCommitments=commitments.map(r=>({category:String(r.category),currency:String(r.currency),amount:String(r.amount)})).sort((a,b)=>(a.category+a.currency).localeCompare(b.category+b.currency));
 const confirmedCostHash=createHash('sha256').update(JSON.stringify(stableCommitments)).digest('hex');
 const cash=await tx`select currency,sum(amount_minor)::text as amount from (select currency,amount_minor from trade_business.payments where company_id=${actor.companyId} and order_id=${order.id} and kind='purchase' and state='active' union all select currency,amount_minor from trade_business.expense_claims where company_id=${actor.companyId} and order_id=${order.id} and kind='reimbursement' and state='paid') c group by currency`;
 const receipts=await tx`select coalesce(sum(amount_minor),0)::text as amount from trade_business.payments where company_id=${actor.companyId} and order_id=${order.id} and kind='sale' and state='active'`;
 const unknown:string[]=[],committed:Partial<Record<CostCategory,string>>={};let paidCost=0n;
 function converted(amount:string,from:string){const fromCurrency=currency.parse(from),rate=fromCurrency===order.currency?'1':latest?.snapshot.rates.find(r=>r.currency===fromCurrency)?.rate;if(!rate){unknown.push('FX:'+fromCurrency);return null;}return BigInt(convertMinor(amount,fromCurrency,order.currency,rate));}
 for(const row of commitments){const category=z.enum(costCategories).parse(row.category),amount=converted(String(row.amount),String(row.currency));if(amount!==null)committed[category]=(BigInt(committed[category]??'0')+amount).toString();}
 for(const row of cash){const amount=converted(String(row.amount),String(row.currency));if(amount!==null)paidCost+=amount;}
 let analysis:ReturnType<typeof analyseCosts>|null=null;
 if(!latest||!baseline)risks.push({code:'NO_COST_BASELINE',level:'warning',stage:'报价',title:'尚未建立订单报价成本基线',advice:'由管理员核对采购、生产、物流和其他费用，保存首版成本预算后再判断利润。'});
 else if(latest.snapshot.currency!==order.currency)risks.push({code:'ORDER_CURRENCY_CHANGED',level:'critical',stage:'订单变更',title:'订单币种与成本基线不一致',advice:'提交管理员核对币种变更及报价版本；当前不输出利润结论。'});
 else{
  if(latest.snapshot.confirmedCostHash!==confirmedCostHash)unknown.push('CONFIRMED_COSTS_CHANGED');
  const b=zero(),f=zero();for(const item of baseline.snapshot.items)b[item.category]=parseDecimal(item.amount,currencyScale[order.currency]).toString();for(const item of latest.snapshot.items){f[item.category]=parseDecimal(item.amount,currencyScale[order.currency]).toString();if(item.certainty==='unknown')unknown.push(item.category);}
  analysis=analyseCosts({revenueMinor:order.totalMinor,baselineRevenueMinor:baseline.snapshot.revenueMinor,baseline:b,forecast:f,committed,unknown:[...new Set(unknown)],baselineUnknown:baseline.snapshot.items.filter(i=>i.certainty==='unknown').map(i=>i.category),minimumMarginBps:latest.snapshot.minimumMarginBps});risks.push(...analysis.risks);
  if(latest.snapshot.items.some(i=>i.certainty==='estimated'))risks.push({code:'UNLOCKED_COSTS',level:'warning',stage:'采购与订舱',title:'订单仍有暂估、未锁定的成本',advice:'在采购确认或订舱前重新取得有效报价，核对费用承担与浮动条款。'});
  if(latest.snapshot.sourceVersion!==order.sourceVersion)risks.push({code:'ORDER_VERSION_CHANGED',level:'warning',stage:'订单变更',title:'订单已修订，成本尚未按新版本复核',advice:'核对商品、数量、贸易条件、交期和费用承担，再追加成本版本。'});
  if(['draft','submitted'].includes(order.state)&&latest.snapshot.quoteValidUntil<today)risks.push({code:'QUOTE_EXPIRED',level:'warning',stage:'报价',title:'报价有效期已过',advice:'重新确认采购、汇率和客户报价，避免沿用过期条件。'});
  const shipment=await tx`select 1 from trade_business.shipments where company_id=${actor.companyId} and order_id=${order.id} and state='confirmed' limit 1`;
  if(!shipment.length&&BigInt(f.logistics)>0n&&latest.snapshot.freightValidUntil<today&&order.state!=='completed')risks.push({code:'FREIGHT_EXPIRED',level:'warning',stage:'订舱出运',title:'物流报价有效期已过',advice:'在订舱前重新确认运价、燃油及旺季附加费和港杂费用。'});
  if(latest.snapshot.rates.some(r=>{const before=baseline.snapshot.rates.find(b=>b.currency===r.currency);return before&&parseDecimal(before.rate,6)!==parseDecimal(r.rate,6);}))risks.push({code:'FX_RATE_CHANGED',level:'warning',stage:'成本与结汇',title:'成本折算汇率与报价基线不同',advice:'核对采购及费用币种、实际结算汇率和报价汇率，确认对预计利润的影响。'});
 }
 if(BigInt(order.totalMinor)>BigInt(String(receipts[0].amount))&&order.dueDay<today&&['confirmed','fulfilling','completed'].includes(order.state))risks.push({code:'PAYMENT_OVERDUE',level:'critical',stage:'收款',title:'订单存在逾期未收款',advice:'核对客户付款及信用条件，联系订单负责人和管理员确认后续发货与催收安排。'});
 if(['confirmed','fulfilling'].includes(order.state)&&typeof order.payload.deliveryDate==='string'&&order.payload.deliveryDate<today)risks.push({code:'DELIVERY_OVERDUE',level:'warning',stage:'生产交付',title:'订单已超过约定交期且尚未完成',advice:'核对生产、到货和出运进度，确认客户沟通及潜在追加费用。'});
 const pending=await tx`select count(*)::int as count from trade_business.expense_claims where company_id=${actor.companyId} and order_id=${order.id} and kind='reimbursement' and state='submitted'`;
 if(Number(pending[0].count)>0)risks.push({code:'PENDING_EXPENSE',level:'warning',stage:'费用归集',title:'存在待审批报销，预计成本需要复核',advice:'待审批报销尚未计入已确认成本，请管理员核对是否需要更新预计成本。'});
 // All monetary values stay on the administrator-only report, never on the staff feed.
 const stableCash=cash.map(r=>({currency:String(r.currency),amount:String(r.amount)})).sort((a,b)=>a.currency.localeCompare(b.currency));
 const fingerprint=createHash('sha256').update(JSON.stringify({orderVersion:order.version,sourceVersion:order.sourceVersion,versions,commitments:stableCommitments,cash:stableCash,received:receipts[0].amount,pending:pending[0].count,risks})).digest('hex');
 return {orderId:order.id,orderNo:order.no,currency:order.currency,revenueMinor:order.totalMinor,version:latest?.version??0,versions,analysis,committed,paidCostMinor:unknown.some(u=>u.startsWith('FX:'))?null:paidCost.toString(),risks,fingerprint,confirmedCostHash};
}
export async function getOrderCosts(actor:BusinessActor,id:string,today=businessDay()){checkAdmin(actor,actor.aal);date.parse(today);return readBusiness(actor,async tx=>orderCosts(tx,actor,await lookupOrder(tx,actor,id),today));}
export async function riskContext(tx:BusinessTx,actor:BusinessActor,id:string){const order=await lookupOrder(tx,actor,id);if(actor.role!=='admin'&&order.ownerId!==actor.id&&order.operationsId!==actor.id)throw new Error('NOT_FOUND');const report=await orderCosts(tx,actor,order,businessDay());return {orderId:order.id,fingerprint:report.fingerprint,risks:report.risks};}
export async function riskFeed(actor:BusinessActor,params:URLSearchParams){const today=date.parse(params.get('today')??businessDay()),offset=z.coerce.number().int().min(0).max(100000).parse(params.get('offset')??0);return readBusiness(actor,async tx=>{
 const orders=await tx`select id from trade_business.orders where company_id=${actor.companyId} and state<>'cancelled' and (${actor.role==='admin'} or (${actor.role==='sales'} and owner_id=${actor.id}) or (${actor.role==='operations'} and operations_id=${actor.id})) order by created_at desc,id limit 21 offset ${offset}`;
 const read=await tx`select risk_key from trade_business.risk_reads where company_id=${actor.companyId} and user_id=${actor.id}`;const seen=new Set(read.map(r=>String(r.risk_key))),items=[];
 for(const row of orders.slice(0,20)){const order=await lookupOrder(tx,actor,String(row.id)),report=await orderCosts(tx,actor,order,today);for(const risk of report.risks){const key=createHash('sha256').update(order.id+'|'+risk.code+'|'+report.fingerprint).digest('hex');items.push({...risk,key,orderId:order.id,orderNo:order.no,read:seen.has(key)});}}
 return {items,hasMore:orders.length>20,offset,checkedAt:new Date().toISOString(),delivery:'in-app-polling' as const};
 });}
export async function acknowledgeRisk(actor:BusinessActor,raw:unknown){const input=z.object({requestId:uuid,orderId:uuid,key:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'risk.read',payload:input},async tx=>{
 const order=await lookupOrder(tx,actor,input.orderId);if(actor.role!=='admin'&&order.ownerId!==actor.id&&order.operationsId!==actor.id)throw new Error('NOT_FOUND');
 const report=await orderCosts(tx,actor,order,businessDay());if(!report.risks.some(r=>createHash('sha256').update(order.id+'|'+r.code+'|'+report.fingerprint).digest('hex')===input.key))throw new Error('VERSION_CONFLICT');
 await tx`insert into trade_business.risk_reads(company_id,user_id,risk_key) values(${actor.companyId},${actor.id},${input.key}) on conflict do nothing`;return {key:input.key};
 });}
