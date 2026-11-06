'use client';
import { useState } from 'react';
import { contractFields,buildSalesContract } from './contracts';
import { contractInputSchema,type Workspace } from './model';
import { downloadTradeDocument,saveBlob } from './document-actions';
import { saveDocument } from './operations';
import { FormError,errorMessage,today } from './ui';
export function ContractForm({state,orderId,update}:{state:Workspace;orderId:string;update:(fn:(s:Workspace)=>Workspace)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const order=state.orders.find(o=>o.id===orderId);if(!order)return null;
 const previous=state.documents.filter(d=>d.snapshot.type==='SC'&&d.snapshot.sourceId===orderId).at(-1)?.snapshot;
 async function generate(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const input=contractInputSchema.parse(Object.fromEntries(new FormData(e.currentTarget)));if(state.documents.some(d=>d.snapshot.number===input.number))throw new Error('合同编号已存在，请使用新的版本编号');const snapshot=buildSalesContract(state,orderId,input),blob=await downloadTradeDocument(snapshot);update(s=>{if(s.documents.some(d=>d.snapshot.number===input.number))throw new Error('合同编号已存在');return saveDocument(s,snapshot,crypto.randomUUID());});saveBlob(blob,snapshot.number+'.pdf');setMessage('销售合同 PDF 已下载并保存不可变版本。当前为未签署状态。');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <section className="panel"><div className="panel-heading"><h2>销售合同 / Sales Contract</h2></div><div className="section-body"><p>货物、金额、买卖双方及付款条件取自本订单。以下条款须按实际约定填写；不预设适用法律、仲裁机构或免责责任。</p><p className="note-line">生成的是可供双方审核签署的合同文本；本机试用未接签章、回签上传或法律审核。</p><FormError message={error}/>{message&&<p role="status" className="success">{message}</p>}</div><form onSubmit={generate} key={previous?.number??'new'}><div className="form-grid"><label>合同编号 / 版本<input name="number" required maxLength={80} defaultValue={'SC-'+order.no+'-V'+(state.documents.filter(d=>d.snapshot.type==='SC'&&d.snapshot.sourceId===orderId).length+1)}/></label><label>合同日期<input name="date" type="date" required min={order.date} defaultValue={today()}/></label>{contractFields.map(([key,label])=><label key={key}>{label}{key==='signingPlace'?<input name={key} required maxLength={120} defaultValue={previous?.contract?.[key]??''}/>:<textarea name={key} required={key!=='additional'} rows={3} maxLength={2000} defaultValue={previous?.contract?.[key]??''}/>}</label>)}<label><input name="reviewed" type="checkbox" required/>已核对本订单买卖双方、金额、付款和交货条件及以上合同条款</label></div><div className="form-actions"><button className="button primary" disabled={busy}>{busy?'生成中…':'生成销售合同 PDF 并保存版本'}</button></div></form></section>;
}
