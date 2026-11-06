import type {Employee} from '@/server/auth/employee';
export type BusinessRecord={id:string;companyId:string;ownerId:string|null;kind:'customer'|'product'|'supplier';payload:Record<string,unknown>};
export function projectRecord(actor:Employee,record:BusinessRecord){
 const customerFields=['id','name','country','address','email','phone','contact','source'];
 const productFields=['id','sku','nameZh','nameEn','spec','unit','hsCode','origin','unitPrice','declarationName','declarationElements','taxCommodityCode','refundRate','classificationSource','classificationDate','classificationStatus'];
 const fields=record.kind==='product'?[...productFields,...(actor.role==='admin'?['costPrice','supplierId','purchaseCurrency']:[])]:customerFields;
 const payload=Object.fromEntries(Object.entries(record.payload).filter(([key])=>fields.includes(key)));return {...record,payload};
}
