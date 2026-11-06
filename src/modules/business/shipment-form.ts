import {date,decimal,positiveDecimal} from './schemas';
import {parseDecimal} from '@/domain/decimal';
import {assertPrecision} from '@/domain/precision';
import {formatMinor} from '@/domain/money';
import type {OrderDetailDTO} from './dto';
type Detail={order:Pick<OrderDetailDTO['order'],'id'>;lines:Pick<OrderDetailDTO['lines'][number],'id'|'snapshot'>[];receipts:Pick<OrderDetailDTO['receipts'][number],'id'|'orderLineId'|'available'>[]};
const value=(data:FormData,key:string)=>String(data.get(key)??'').trim();
function positive(data:FormData,key:string,label:string){const text=value(data,key);if(!positiveDecimal.safeParse(text).success)throw new Error(label+'必须大于0，最多4位小数。');return text;}
export function prepareShipment(detail:Detail,data:FormData){
 if(!detail.receipts.length)throw new Error('尚未登记到货。请先到“采购到货”确认采购并录入实际到货，再分配出运。');
 if(!detail.receipts.some(receipt=>parseDecimal(receipt.available,4)>0n))throw new Error('到货来源已全部分配，当前没有可用出运数量。');
 const shipmentDate=value(data,'date'),portLoad=value(data,'portLoad'),portDischarge=value(data,'portDischarge'),transport=value(data,'transport');
 if(!date.safeParse(shipmentDate).success)throw new Error('请填写有效的出运日期。');
 if(!portLoad||portLoad.length>100)throw new Error('请填写装运港（最多100字）。');
 if(!portDischarge||portDischarge.length>100)throw new Error('请填写目的港（最多100字）。');
 if(transport.length>40)throw new Error('运输方式最多40字。');
 const lines=[];
 for(const line of detail.lines){
  const name=String(line.snapshot.description??'商品'),sources=[];let quantity=0n;
  for(const receipt of detail.receipts.filter(receipt=>receipt.orderLineId===line.id)){
   const text=value(data,'source_'+receipt.id)||'0';if(!decimal.safeParse(text).success)throw new Error(name+'：出运数量必须为非负数，最多4位小数。');
   const amount=parseDecimal(text,4);if(amount>parseDecimal(receipt.available,4))throw new Error(name+'：本次出运数量超过该到货来源的可用数量。');
   if(amount>0n){sources.push({receiptLineId:receipt.id,quantity:text});quantity+=amount;}
  }
  if(!sources.length)continue;
  const packages=Number(value(data,'packages_'+line.id));if(!Number.isInteger(packages)||packages<1||packages>1000000)throw new Error(name+'：箱数必须为1至1000000的整数。');
  const netKg=positive(data,'netKg_'+line.id,name+'：净重'),grossKg=positive(data,'grossKg_'+line.id,name+'：毛重'),cbm=positive(data,'cbm_'+line.id,name+'：体积CBM');
  if(parseDecimal(grossKg,4)<parseDecimal(netKg,4))throw new Error(name+'：毛重不能小于净重。');
  const marks=value(data,'marks_'+line.id),dimensions=value(data,'dimensions_'+line.id);if(marks.length>500||dimensions.length>500)throw new Error(name+'：唛头或尺寸最多500字。');
  lines.push({orderLineId:line.id,quantity:formatMinor(quantity,4),packages,netKg,grossKg,cbm,marks,dimensions,sources});
 }
 if(!lines.length)throw new Error('请至少为一个到货来源填写本次出运数量（大于0）。');
 return {orderId:detail.order.id,date:shipmentDate,portLoad,portDischarge,transport,lines};
}
export function calculateCbm(dimensions:string,packages:string){
 const values=dimensions.trim().replace(/\s*cm$/i,'').split(/[xX×*]/).map(value=>value.trim());
 if(values.length!==3||values.some(value=>!positiveDecimal.safeParse(value).success)||packages.length>7||!/^\d+$/.test(packages)||BigInt(packages)<1n||BigInt(packages)>1000000n)throw new Error('请填写单箱长×宽×高（厘米，如30×30×30）和有效整数箱数。');
 const units=values.map(value=>parseDecimal(value,4)),scaled=(units[0]*units[1]*units[2]*BigInt(packages)+50000000000000n)/100000000000000n;
 const result=formatMinor(scaled,4);if(scaled===0n)throw new Error('计算体积不足0.0001m³，请核对尺寸或填写有效总CBM。');
 try{assertPrecision(result,'quantity');}catch{throw new Error('计算体积超出范围，请核对尺寸与箱数。');}return result;
}
