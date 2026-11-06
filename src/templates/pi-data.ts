export type PiSnapshot={id:string;customer:string;company:string;currency:string;scale:number;templateVersion:string;totalMinor:string;lines:{description:string;quantity:string;price:string;amountMinor:string}[]};
import { z } from 'zod';
import { lineAmountMinor } from '@/domain/money';
import { parseDecimal } from '@/domain/decimal';
const source=z.object({id:z.string().min(1).max(80),customer:z.string().trim().min(1).max(120),quantity:z.string().max(32),price:z.string().max(32)});
export function buildPiSnapshot(input:{id:string;customer:string;quantity:string;price:string},count=1):PiSnapshot {
 const data=source.parse(input);
 if(!Number.isInteger(count)||count<1||count>100)throw new Error('INVALID_LINE_COUNT');
 if(parseDecimal(data.quantity,4)<=0n)throw new Error('INVALID_QUANTITY');
 const amount=lineAmountMinor(data.quantity,data.price,2);
 const lines=Array.from({length:count},(_,index)=>({description:`${index+1}. 通用工业连接件 / Industrial connector — long bilingual product description for layout verification`,quantity:data.quantity,price:data.price,amountMinor:amount.toString()}));
 return {id:data.id,customer:data.customer,company:'示例外贸公司 / Demonstration Trading Co.',currency:'USD',scale:2,templateVersion:'pi-probe-v1',totalMinor:(amount*BigInt(count)).toString(),lines};
}
