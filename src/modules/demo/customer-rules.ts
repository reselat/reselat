import { z } from 'zod';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const timestamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
},'请输入有效日期');
const draft=z.object({name:z.string().trim().min(1,'填写公司名称').max(120),country:z.string().trim().min(1,'填写国家').max(60),city:z.string().trim().max(60),note:z.string().trim().max(1000),next:date});
export function validateCustomerDraft(value: unknown) { return draft.safeParse(value); }
export function filterCustomers<T extends {name:string;country:string;city:string}>(rows:T[],query:string): T[] {
 const q=query.trim().toLowerCase();return rows.filter(row=>[row.name,row.country,row.city].some(text=>text.toLowerCase().includes(q)));
}
export function validateFollowup(value: unknown) { return z.string().trim().min(1,'请填写跟进内容').max(1000).safeParse(value); }
