'use client';
import type { TradeDocument } from './model';
export async function downloadTradeDocument(snapshot:TradeDocument){
 const response=await fetch('/api/demo/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot)});
 if(!response.ok)throw new Error('单据未生成，请检查买卖双方地址、金额及装箱资料。');
 return response.blob();
}
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
