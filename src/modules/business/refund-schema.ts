import {z} from 'zod';
export const refundLabels={export_contract:'出口销售合同',purchase_contract:'采购合同 / 订单',purchase_invoice:'采购进项发票',customs:'出口报关凭证',transport:'运输及委托报关资料',ci_pl:'商业发票与装箱单',collection:'收汇及其他财务资料'};
export const refundKey=z.enum(['export_contract','purchase_contract','purchase_invoice','customs','transport','ci_pl','collection']);
export const refundStatus=z.enum(['missing','uploaded','pending_review','reviewed','not_applicable']);
export const reportSchema=z.object({orderId:z.string().uuid(),orderNo:z.string(),createdAt:z.string(),complete:z.boolean(),warnings:z.array(z.string()),items:z.array(z.object({key:refundKey,label:z.string(),status:refundStatus,version:z.number().int(),reference:z.string(),reason:z.string(),fileIds:z.array(z.string().uuid())})),files:z.array(z.object({id:z.string().uuid(),name:z.string(),mime:z.string(),size:z.number().int(),sha256:z.string()}))});
export type RefundReport=z.infer<typeof reportSchema>;
