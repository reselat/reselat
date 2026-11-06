import {z} from 'zod';
export const customerStage=z.enum(['potential','walk_in','regular','key_account','pending','invalid']);
export const customerStageLabels:Record<z.infer<typeof customerStage>,string>={potential:'潜在客户',walk_in:'散客',regular:'固定客户',key_account:'大客户',pending:'待确认客户',invalid:'无效客户'};
export const customerStageDescriptions:Record<z.infer<typeof customerStage>,string>={potential:'有采购意向',walk_in:'样品单或仅采购一次',regular:'正常采购两次及以上',key_account:'多次正常采购且合作跨度一年以上',pending:'采购意向待确认',invalid:'无采购意向'};
export function suggestCustomerStage(orders:{day:string;sample:boolean}[]){const normal=orders.filter(o=>!o.sample).map(o=>o.day).sort(),first=normal[0],last=normal.at(-1);let suggested:z.infer<typeof customerStage>|null=null;
 if(normal.length>=3&&first&&last){const anniversary=new Date(first+'T00:00:00Z');anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);if(last>anniversary.toISOString().slice(0,10))suggested='key_account';}
 if(!suggested&&normal.length>=2)suggested='regular';if(!suggested&&orders.length)suggested='walk_in';
 return {completedNormalOrders:normal.length,completedSampleOrders:orders.length-normal.length,firstOrderDay:first??null,lastOrderDay:last??null,suggestedStage:suggested};
}
