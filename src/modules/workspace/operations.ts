import { parseDecimal } from '@/domain/decimal';
import { lineAmountMinor,formatMinor } from '@/domain/money';
import { currencyScale,orderInputSchema,paymentInputSchema,shipmentInputSchema,tradeDocumentSchema,workspaceSchema,partySchema,companySchema,customsSchema } from './model';
import type {Workspace,OrderInput,PaymentInput,ShipmentInput,DocumentType,TradeDocument,OrderLine} from './model';
const copy=<T>(value:T):T=>structuredClone(value);
const fail=(message:string):never=>{throw new Error(message);};
const positive=(v:string)=>{if(parseDecimal(v,4)<=0n)fail('数量必须大于零');};
function source(s:Workspace,kind:'sale'|'purchase',id:string){return (kind==='sale'?s.orders:s.purchases).find(o=>o.id===id)??fail('未找到关联单据');}
export function createOrder(s:Workspace,input:OrderInput,id:string):Workspace{
 const data=orderInputSchema.parse(input);if(s.orders.some(o=>o.id===id))fail('订单标识重复');
 const customer=partySchema.parse(s.customers.find(c=>c.id===data.customerId)??fail('客户不存在'));companySchema.parse(s.company);
 const groups=new Map<string,{supplierId:string;currency:typeof data.currency;lines:OrderLine[]}>();
 const lines=data.lines.map((line,index)=>{
  positive(line.quantity);const product=s.products.find(p=>p.id===line.productId)??fail('产品不存在');
  const result:OrderLine={...customsSchema.parse(product),id:`${id}-line-${index+1}`,productId:product.id,sku:product.sku,description:product.nameEn,spec:product.spec,unit:product.unit,hsCode:product.hsCode,origin:product.origin,quantity:line.quantity,unitPrice:line.unitPrice,amountMinor:lineAmountMinor(line.quantity,line.unitPrice,currencyScale[data.currency]).toString()};
  if(data.makePurchases){if(!s.suppliers.some(p=>p.id===line.supplierId))fail('请选择有效供应商');const key=line.supplierId+':'+product.purchaseCurrency;
   const group=groups.get(key)??{supplierId:line.supplierId,currency:product.purchaseCurrency,lines:[]};group.lines.push({...result,unitPrice:line.costPrice,amountMinor:lineAmountMinor(line.quantity,line.costPrice,currencyScale[product.purchaseCurrency]).toString()});groups.set(key,group);
  }return result;
 });
 const no=`SO-${data.date.replaceAll('-','')}-${String(s.orders.length+1).padStart(4,'0')}`;
 const order={id,no,date:data.date,dueDate:data.dueDate,deliveryDate:data.deliveryDate,validUntil:data.validUntil??data.date,currency:data.currency,customer:copy(customer),seller:copy(s.company),lines,totalMinor:lines.reduce((sum,l)=>sum+BigInt(l.amountMinor),0n).toString(),incoterm:data.incoterm,namedPlace:data.namedPlace,paymentTerms:data.paymentTerms,buyerReference:data.buyerReference};
 const next=copy(s);next.orders.push(order);
 let n=0;for(const group of groups.values()){
  n++;const supplier=next.suppliers.find(p=>p.id===group.supplierId)??fail('供应商不存在');
  next.purchases.push({id:`${id}-po-${n}`,no:`PO-${data.date.replaceAll('-','')}-${String(s.purchases.length+n).padStart(4,'0')}`,orderId:id,supplier:copy(supplier),seller:copy(s.company),date:data.date,dueDate:data.purchaseDueDate??data.dueDate,currency:group.currency,lines:group.lines,totalMinor:group.lines.reduce((sum,l)=>sum+BigInt(l.amountMinor),0n).toString(),paymentTerms:data.purchasePaymentTerms??''});
 }
 next.revision++;return workspaceSchema.parse(next);
}
export function getBalance(s:Workspace,kind:'sale'|'purchase',id:string){
 const doc=source(s,kind,id);const total=BigInt(doc.totalMinor);
 const paid=s.payments.filter(p=>p.kind===kind&&p.refId===id&&!p.voidReason).reduce((sum,p)=>sum+BigInt(p.amountMinor),0n);
 return {total:total.toString(),paid:paid.toString(),remaining:(total-paid).toString(),currency:doc.currency,status:paid===0n?'unpaid':paid===total?'paid':'partial'};
}
export function recordPayment(s:Workspace,input:PaymentInput,id:string):Workspace{
 const data=paymentInputSchema.parse(input);const existing=s.payments.find(p=>p.id===id);
 if(existing){if(Object.entries(data).every(([k,v])=>existing[k as keyof typeof data]===v))return s;fail('流水标识对应的内容不同');}
 const doc=source(s,data.kind,data.refId);if(data.currency!==doc.currency)fail('收付款币种必须与单据一致，不能直接核销其他币种');
 const amount=parseDecimal(data.amount,currencyScale[data.currency]);if(amount<=0n)fail('金额必须大于零');
 if(amount>BigInt(getBalance(s,data.kind,data.refId).remaining))fail('金额超过未结余额');
 if(s.payments.some(p=>p.kind===data.kind&&p.refId===data.refId&&p.reference===data.reference&&!p.voidReason))fail('该单据已有相同银行流水／凭证编号');
 const next=copy(s);next.payments.push({...data,id,amountMinor:amount.toString(),voidReason:''});next.revision++;return workspaceSchema.parse(next);
}
export function voidPayment(s:Workspace,id:string,reason:string):Workspace{
 if(!reason.trim()||reason.length>500)fail('请填写冲销原因');const next=copy(s);const payment=next.payments.find(p=>p.id===id)??fail('流水不存在');
 if(payment.voidReason)fail('流水已经冲销');payment.voidReason=reason.trim();next.revision++;return next;
}
export function currencySummary(s:Workspace,kind:'sale'|'purchase',today:string){
 const grouped=new Map<string,{currency:string;remaining:bigint;overdue:bigint;count:number}>();
 for(const doc of kind==='sale'?s.orders:s.purchases){const balance=getBalance(s,kind,doc.id);const row=grouped.get(doc.currency)??{currency:doc.currency,remaining:0n,overdue:0n,count:0};const remaining=BigInt(balance.remaining);row.remaining+=remaining;if(remaining>0n){row.count++;if(doc.dueDate<today)row.overdue+=remaining;}grouped.set(doc.currency,row);}
 return [...grouped.values()].map(r=>({...r,remaining:r.remaining.toString(),overdue:r.overdue.toString()}));
}
export function createShipment(s:Workspace,input:ShipmentInput,id:string):Workspace{
 const data=shipmentInputSchema.parse(input);if(s.shipments.some(x=>x.id===id))fail('出运批次标识重复');
 const order=s.orders.find(o=>o.id===data.orderId)??fail('订单不存在');if(data.date<order.date)fail('出运日期不得早于订单');
 const requested=new Map<string,bigint>();
 for(const l of data.lines){positive(l.quantity);const line=order.lines.find(x=>x.id===l.orderLineId)??fail('出运商品不属于该订单');
  const allocated=s.shipments.filter(x=>x.orderId===order.id).flatMap(x=>x.lines).filter(x=>x.orderLineId===line.id).reduce((sum,x)=>sum+parseDecimal(x.quantity,4),0n);
  const qty=parseDecimal(l.quantity,4)+(requested.get(line.id)??0n);if(allocated+qty>parseDecimal(line.quantity,4))fail('累计出运数量超过订单数量');requested.set(line.id,qty);
  if(parseDecimal(l.netKg,4)<=0n||parseDecimal(l.grossKg,4)<parseDecimal(l.netKg,4))fail('净重必须大于零且毛重不得小于净重');
  if(parseDecimal(l.cbm,4)<=0n)fail('体积必须大于零');
 }
 const next=copy(s);next.shipments.push({...data,id,no:`SH-${data.date.replaceAll('-','')}-${String(s.shipments.length+1).padStart(4,'0')}`});next.revision++;return workspaceSchema.parse(next);
}
export function buildTradeDocument(s:Workspace,sourceId:string,type:DocumentType):TradeDocument{
 const shipment=(type==='CI'||type==='PL')?s.shipments.find(x=>x.id===sourceId):undefined;
 if((type==='CI'||type==='PL')&&!shipment)fail('请先录入本批次出运和装箱资料');
 const purchase=type==='PO'?s.purchases.find(x=>x.id===sourceId):undefined;if(type==='PO'&&!purchase)fail('采购单不存在');
 const order=s.orders.find(o=>o.id===(shipment?.orderId??purchase?.orderId??sourceId))??fail('订单不存在');
 const lines=(purchase?.lines??order.lines).flatMap(line=>{
  const matches=shipment?shipment.lines.filter(x=>x.orderLineId===line.id):[undefined];
  let prior=shipment?s.shipments.slice(0,s.shipments.findIndex(x=>x.id===shipment.id)).filter(x=>x.orderId===order.id).flatMap(x=>x.lines).filter(x=>x.orderLineId===line.id).reduce((sum,x)=>sum+parseDecimal(x.quantity,4),0n):0n;
  return matches.map(sh=>{let amount=BigInt(line.amountMinor),adjustment=0n;if(sh){const previousAmount=lineAmountMinor(formatMinor(prior,4),line.unitPrice,currencyScale[order.currency]);prior+=parseDecimal(sh.quantity,4);amount=lineAmountMinor(formatMinor(prior,4),line.unitPrice,currencyScale[order.currency])-previousAmount;adjustment=amount-lineAmountMinor(sh.quantity,line.unitPrice,currencyScale[order.currency]);}
   return {...copy(line),quantity:sh?.quantity??line.quantity,amountMinor:amount.toString(),roundingAdjustmentMinor:adjustment.toString(),packages:sh?.packages??0,netKg:sh?.netKg??'0',grossKg:sh?.grossKg??'0',cbm:sh?.cbm??'0',marks:sh?.marks??'',dimensions:sh?.dimensions??''};});
 });
 const buyer=purchase?.supplier??order.customer;
 return tradeDocumentSchema.parse({type,number:`${type}-${shipment?.no??purchase?.no??order.no}`,date:shipment?.date??order.date,sourceId,orderNo:order.no,seller:purchase?.seller??order.seller,buyer:copy(buyer),consignee:copy(buyer),currency:purchase?.currency??order.currency,lines,totalMinor:lines.reduce((sum,l)=>sum+BigInt(l.amountMinor),0n).toString(),incoterm:purchase?'待确认':order.incoterm,namedPlace:purchase?'待确认':order.namedPlace,paymentTerms:purchase?.paymentTerms??order.paymentTerms,buyerReference:order.buyerReference,deliveryDate:order.deliveryDate,validUntil:order.validUntil,portLoad:shipment?.portLoad??'',portDischarge:shipment?.portDischarge??'',transport:shipment?.transport??'',shipmentNo:shipment?.no??'',templateVersion:'trade-v2'});
}
export function saveDocument(s:Workspace,d:TradeDocument,id:string):Workspace{
 const snapshot=tradeDocumentSchema.parse(d);if(s.documents.some(x=>x.id===id))fail('单据版本标识重复');
 const next=copy(s);next.documents.push({id,createdAt:new Date().toISOString(),snapshot:copy(snapshot)});next.revision++;return workspaceSchema.parse(next);
}
