'use client';
import {z} from 'zod';
import {customerStage,customerStageLabels,customerStageDescriptions} from '../customer-stage';
import {useResource} from './client';
const suggestionDTO=z.object({completedNormalOrders:z.number(),completedSampleOrders:z.number(),firstOrderDay:z.string().nullable(),lastOrderDay:z.string().nullable(),suggestedStage:customerStage.nullable()});
export function CustomerStageBadge({value}:{value:unknown}){const stage=customerStage.catch('pending').parse(value);return <span className={'business-color-tag customer-stage-'+stage} title={customerStageDescriptions[stage]}>{customerStageLabels[stage]}</span>;}
export function CustomerStageSuggestion({id,current}:{id:string;current:unknown}){const r=useResource({view:'customer-stage-suggestion',id},suggestionDTO);return <div className="shared-note">{r.error&&<p role="alert">{r.error}</p>}{r.data&&<><p>已完成正常订单 {r.data.completedNormalOrders} 次，样品单 {r.data.completedSampleOrders} 次。合作跨度以首末已完成正常订单日期核对。</p>{r.data.suggestedStage&&r.data.suggestedStage!==current&&<p>成交历史建议：<CustomerStageBadge value={r.data.suggestedStage}/>。分类仍由经办人手动选择，系统不自动修改，也不从订单推断采购意向。</p>}</>}</div>;}
