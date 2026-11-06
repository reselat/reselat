'use client';
import {useState} from 'react';
import {recordOriginsDTO,orderOriginsDTO} from '../origin-schema';
import {useResource,useMutation} from './client';
import {useFileUpload} from './upload';
import {Modal,Panel,ResourceState,MutationState,Status,Submit} from './shared';
export function RecordOrigins({kind,id,name,onClose,onSaved}:{kind:'product'|'supplier';id:string;name:string;onClose:()=>void;onSaved:()=>void}){
 const resource=useResource({view:'record-origins',kind,id},recordOriginsDTO),mutation=useMutation(()=>{resource.reload();onSaved();}),upload=useFileUpload(),[file,setFile]=useState<File>();
 return <Modal title={name+' · 原产地证书（CO）'} onClose={onClose}>
  <p className="shared-note">先保存主档，再上传并关联CO。产品默认供应商的已关联CO也会带入后续订单；请核对证书是否适用于本批次。</p>
  <button type="button" className="button" onClick={resource.reload}>刷新证书列表</button><ResourceState {...resource}/><MutationState state={mutation}/>
  <form onSubmit={async event=>{event.preventDefault();if(!file||!resource.data)return;const fileId=await upload.upload(file,null,'origin',{recordKind:kind,recordId:id});if(fileId)await mutation.run('origin.attach',{kind,recordId:id,fileId,expectedVersion:resource.data.version});}}>
   <label>上传PDF / PNG / JPEG（最大10MiB）<input type="file" accept="application/pdf,image/png,image/jpeg" required onChange={event=>setFile(event.target.files?.[0])}/></label>
   <Submit label="上传并关联CO" busy={upload.busy||mutation.busy||!resource.data}/>
   {upload.busy&&<p role="status">上传进度 {upload.progress}%</p>}{upload.error&&<p role="alert">{upload.error}</p>}
  </form>
  <div className="shared-table-wrap"><table><thead><tr><th>证书文件</th><th>状态</th><th>操作</th></tr></thead><tbody>{resource.data?.files.map(file=><tr key={file.id}><td>{file.name}</td><td>{file.active?'已关联':'未用于后续订单'}<div><Status value={file.state}/></div></td><td><div className="shared-actions">{file.state==='stored'&&<><a className="button" href={'/api/workspace/files?id='+file.id}>下载CO</a><button className="button" disabled={mutation.busy} onClick={()=>mutation.run(file.active?'origin.detach':'origin.attach',{kind,recordId:id,fileId:file.id,expectedVersion:resource.data?.version})}>{file.active?'移除关联':'关联后续订单'}</button></>}</div></td></tr>)}</tbody></table></div>
  <p className="shared-note">最多关联10份。移除关联会保留原文件和已确认订单中的证书，不删除历史。</p>
 </Modal>;
}
export function OrderOrigins({orderId}:{orderId:string}){
 const resource=useResource({view:'order-origins',id:orderId},orderOriginsDTO);
 return <Panel title="产品原产地证书（CO）"><p className="shared-note">来自产品、默认供应商及实际采购供应商的关联CO，按订单或采购保存时的资料固定；使用前核对本批次适用性。</p><ResourceState {...resource}/>
  <div className="shared-table-wrap"><table><thead><tr><th>CO文件</th><th>来源</th><th>操作</th></tr></thead><tbody>{resource.data?.map(file=><tr key={file.id}><td>{file.name}</td><td>{file.source==='product'?'产品主档':'供应商主档'}</td><td><a className="button" href={'/api/workspace/files?id='+file.id+'&orderId='+orderId}>下载CO</a></td></tr>)}</tbody></table></div>
  {!resource.loading&&!resource.error&&!resource.data?.length&&<p className="shared-empty">当前订单未关联CO。请在产品/供应商主档维护后，重新保存订单草稿或提交确认。</p>}
 </Panel>;
}
