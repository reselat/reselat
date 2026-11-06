'use client';
import Link from 'next/link';
import {useState} from 'react';
import {z} from 'zod';
import {useResource,useMutation,sendData} from './client';
import {useActor,Heading,Panel,ResourceState,MutationState,Status} from './shared';
import {ProspectingPipeline,currentProspectingStep} from './prospecting-pipeline';
import {draftSchema,reviewSchema,evidenceSchema} from '../diligence-fusion';
import {outreachDraftSchema,outreachReviewSchema} from '../outreach-fusion';
import {parseLeadBatch} from '../lead-batch';
const row=z.object({id:z.string(),name:z.string().optional(),email:z.string().optional(),source:z.string().optional(),place_id:z.string().nullable().optional(),maps_url:z.string().nullable().optional(),notes:z.string().nullable().optional(),created_at:z.string().optional(),lead_id:z.string().optional(),subject:z.string().optional(),body:z.string().optional(),summary:z.string().optional(),state:z.string().optional(),customer_id:z.string().nullable().optional(),sent_at:z.string().nullable().optional(),brevo_message_id:z.string().nullable().optional(),brevo_send_started_at:z.string().nullable().optional(),written_back_at:z.string().nullable().optional()});
const list=z.object({items:z.array(row)});
const auditList=z.object({items:z.array(z.object({id:z.string(),lead_id:z.string(),status:z.string(),draft:draftSchema,reviews:z.array(reviewSchema),evidence:z.array(evidenceSchema),fusion:z.object({summary:z.string(),agreement_ratio:z.number(),blockers:z.array(z.string())}).nullable(),human_decision:z.string().nullable(),report_id:z.string().nullable()}))});
const outreachAuditsSchema=z.object({items:z.array(z.object({
 id:z.string(),lead_id:z.string(),report_id:z.string(),report_summary:z.string(),status:z.string(),
 draft:outreachDraftSchema,reviews:z.array(outreachReviewSchema),written_back_at:z.string().nullable(),
 fusion:z.object({agreement_ratio:z.number(),blockers:z.array(z.string())}).nullable(),
}))});
const approvalStates=[['pending','待审批'],['approved','已批准 · 待回写 / 已回写'],['rejected','已拒绝']] as const;
type ImportResult={ok:boolean;message:string};
const fieldLabels:Record<string,string>={name:'姓名',email:'邮箱',source:'来源'};
function when(value?:string){return value?value.replace('T',' ').slice(0,16):'—';}
function sourceLabel(value?:string){return value==='maps'?'Maps 导入':value==='json'?'JSON 导入':value==='manual'?'手工新增':value||'—';}
function batchErrorMessage(message:string){
 try{
  const issues:unknown=JSON.parse(message);
  if(Array.isArray(issues)){
   const parts=issues.map(issue=>{
    if(!issue||typeof issue!=='object')return '';
    const rawPath=(issue as {path?:unknown}).path;
    const path=Array.isArray(rawPath)?rawPath.map(String).join('.'):'';
    const raw=typeof (issue as {message?:unknown}).message==='string'?(issue as {message:string}).message:'格式不正确';
    if(raw.includes('Invalid email'))return '邮箱格式不正确';
    if(raw.startsWith('Too small'))return '内容不能为空';
    if(raw.startsWith('Too big'))return '内容过长';
    if(raw.startsWith('Unrecognized key'))return '包含不支持的字段';
    if(raw.includes('expected string'))return `${fieldLabels[path]??'字段'}缺失或格式不正确`;
    return path?`${fieldLabels[path]??path}：${raw}`:raw;
   }).filter(Boolean);
   if(parts.length)return parts.join('；');
  }
 }catch{}
 return message;
}
export function Prospecting(){
 const actor=useActor(),[leadId,setLeadId]=useState(''),[name,setName]=useState(''),[email,setEmail]=useState(''),[json,setJson]=useState(''),[summary,setSummary]=useState(''),[subject,setSubject]=useState(''),[body,setBody]=useState(''),[state,setState]=useState('pending'),[batch,setBatch]=useState<ImportResult[]>([]),[importing,setImporting]=useState(false);
 const enabled=actor.role==='admin';
 const leads=useResource({view:'leads'},list,enabled),reports=useResource({view:'diligence'},list,enabled),drafts=useResource({view:'drafts'},list,enabled),queue=useResource({view:'approval-queue',state},list,enabled);
 const audits=useResource({view:'diligence-audits'},auditList,enabled);
 const outreachAudits=useResource({view:'outreach-audits'},outreachAuditsSchema,enabled);
 const refresh=()=>{outreachAudits.reload();audits.reload();leads.reload();reports.reload();drafts.reload();queue.reload();};
 const mutation=useMutation(refresh);
 const selectLead=(id:string)=>{setLeadId(id);setSummary('');setSubject('');setBody('');};
 async function importJson(){
  setImporting(true);
  const messages:ImportResult[]=[];
  try{
   const parsed=parseLeadBatch(json);
   messages.push(...parsed.errors.map(e=>({ok:false,message:`第 ${e.row} 项失败：${batchErrorMessage(e.message)}`})));
   for(const item of parsed.items){
    try{await sendData('leads_upsert',{requestId:crypto.randomUUID(),payload:item});messages.push({ok:true,message:`${item.email}：已合并保存`});}
    catch(e){messages.push({ok:false,message:`${item.email}：失败 ${e instanceof Error?e.message:String(e)}`});}
   }
  }catch(e){messages.push({ok:false,message:`导入失败：${e instanceof Error?e.message:String(e)}`});}
  finally{setBatch(messages);setImporting(false);refresh();}
 }
 if(actor.role!=='admin')return <><Heading title="获客工作台" description="线索、背调、草稿与人工审批仅对管理员开放。"/><Panel><div className="shared-empty">仅管理员可访问获客工作台与人工审批；如需使用，请联系管理员。</div></Panel></>;
 const disabled=mutation.busy||mutation.uncertain||importing;
 const selectedLead=leads.data?.items.find(l=>l.id===leadId);
 const leadReports=reports.data?.items.filter(r=>r.lead_id===leadId)??[];
 const leadDrafts=drafts.data?.items.filter(d=>d.lead_id===leadId)??[];
 return <><Heading title="获客工作台" description="线索 → 背调 → 草稿互审 → 自动闸门 / 人工审批。回写 ≠ 已发信。"/>
 <ProspectingPipeline current={currentProspectingStep(Boolean(selectedLead),leadReports.length>0,leadDrafts[0]?.state)}/>
 <MutationState state={mutation}/>
 <div className="prospecting-workbench">
 <div id="prospecting-discover" tabIndex={-1} className="prospecting-section">
 <Panel title="线索">
  <div className="shared-toolbar prospecting-toolbar">
   <p className="shared-note">先登记线索，或粘贴 JSON 数组批量导入；同一邮箱会合并保存。列表显示最近 500 条。</p>
   <button className="button" disabled={disabled} onClick={refresh}>刷新</button>
  </div>
  <ResourceState {...leads}/>
  {leads.data&&!leads.data.items.length&&<div className="shared-empty">暂无线索，请在下方新增或批量导入。</div>}
  {!!leads.data?.items.length&&<div className="shared-table-wrap"><table>
   <thead><tr><th>姓名</th><th>邮箱</th><th>来源</th><th>创建时间</th><th>操作</th></tr></thead>
   <tbody>{leads.data.items.map(l=><tr key={l.id} className={'prospecting-lead-row'+(leadId===l.id?' selected':'')} onClick={()=>selectLead(l.id)}>
    <td><strong>{l.name||'未填写姓名'}</strong>{leadId===l.id&&<span className="prospecting-selected-tag">已选择</span>}</td>
    <td>{l.email||'—'}</td>
    <td>{sourceLabel(l.source)}{l.place_id && <div>{l.place_id}</div>}{l.maps_url && <div>{l.maps_url}</div>}{l.notes && <div>{l.notes}</div>}</td>
    <td>{when(l.created_at)}</td>
    <td><button type="button" className="button" onClick={e=>{e.stopPropagation();selectLead(l.id);}}>{leadId===l.id?'已选中':'选择'}</button></td>
   </tr>)}</tbody>
  </table></div>}
  <div className="shared-section-grid prospecting-entry-grid">
   <section className="prospecting-subsection">
    <h3>新增线索</h3>
    <form onSubmit={e=>{e.preventDefault();mutation.run('leads_upsert',{payload:{name,email,source:'manual'}});}}>
     <fieldset className="prospecting-fieldset" disabled={disabled}>
      <div className="form-grid">
       <label>姓名<input value={name} onChange={e=>setName(e.target.value)} placeholder="客户姓名"/></label>
       <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="buyer@example.com"/></label>
      </div>
      <div className="form-actions"><button type="submit" className="button primary" disabled={disabled}>保存线索</button></div>
     </fieldset>
    </form>
   </section>
   <section className="prospecting-subsection">
    <h3>JSON 批量导入（含 Maps）</h3><p>Maps 候选请设置 source 为 maps，可附 placeId、mapsUrl、notes、address、phone；邮箱必填。仅导入已有 JSON，不调用地图服务。</p>
    <form onSubmit={e=>{e.preventDefault();if(json.trim())importJson();}}>
     <fieldset className="prospecting-fieldset" disabled={disabled}>
      <div className="form-grid">
       <label className="full">JSON 数组<textarea value={json} onChange={e=>setJson(e.target.value)} placeholder={'例如：[{"name":"示例客户","email":"buyer@example.com"}]'} maxLength={200000}/></label>
      </div>
      <div className="form-actions"><button type="submit" className="button primary" disabled={disabled||!json.trim()}>{importing?'导入中…':'批量导入'}</button></div>
     </fieldset>
    </form>
    {!!batch.length&&<div className="prospecting-import-log" role="status">
     <p className="shared-note">导入结果：成功 {batch.filter(item=>item.ok).length} 项，失败 {batch.filter(item=>!item.ok).length} 项。</p>
     {batch.map((item,i)=><p key={i} className={'shared-feedback '+(item.ok?'success':'error')}>{item.message}</p>)}
    </div>}
   </section>
  </div>
 </Panel>
 </div>
 <div className="prospecting-detail">
 <Panel title="线索详情 · 背调与草稿">
  <p className="shared-note">先在线索清单中选择一条线索；背调与邮件草稿按线索归档，保存草稿会追加新版本。审批通过也不代表已发送。</p>
  <ResourceState {...reports}/>
  <ResourceState {...drafts}/>
  {!selectedLead&&<div className="shared-empty"><p id="prospecting-diligence" tabIndex={-1}>尚未选择线索。请在线索清单中点击一行，或点击“选择”，开始筛选 / 背调。</p><p id="prospecting-draft" tabIndex={-1}>定制开发信：选择线索后填写并保存草稿。</p></div>}
  {selectedLead&&<>
   <dl className="shared-kv prospecting-lead-summary">
    <div><dt>当前线索</dt><dd>{selectedLead.name||'未填写姓名'}</dd></div>
    <div><dt>邮箱</dt><dd>{selectedLead.email||'—'}</dd></div>
    <div><dt>来源</dt><dd>{sourceLabel(selectedLead.source)}</dd></div>
    <div><dt>创建时间</dt><dd>{when(selectedLead.created_at)}</dd></div>
   </dl>
   <div className="shared-section-grid">
    <section id="prospecting-diligence" tabIndex={-1} className="prospecting-subsection prospecting-section">
     <h3>背调摘要</h3>
     <form onSubmit={e=>{e.preventDefault();mutation.run('diligence_save_report',{payload:{leadId,summary}});}}>
      <fieldset className="prospecting-fieldset" disabled={disabled}>
       <div className="form-grid"><label className="full">本次背调摘要<textarea value={summary} onChange={e=>setSummary(e.target.value)} placeholder="记录客户背景、需求、采购习惯与风险点…"/></label></div>
       <div className="form-actions"><button type="submit" className="button primary" disabled={disabled}>保存背调</button></div>
      </fieldset>
     </form>
     <h3>最近互审状态</h3>
     <ResourceState {...audits}/>
     {(audits.data?.items.filter(a=>a.lead_id===leadId)??[]).map(a=><p key={a.id} className="shared-note">{a.status==='auto_accepted'?'高置信已自动落库':a.human_decision==='accept'?'人工已确认落库':a.status==='rejected_by_policy'?'人工已驳回':a.fusion?'待人工':'等待审计 / 融合'} · {a.id.slice(0,8)}</p>)}
     <h3>历史背调</h3>
     {leadReports.length?<ul className="shared-timeline">{leadReports.map(r=><li key={r.id}><small>{when(r.created_at)}</small><p>{r.summary}</p></li>)}</ul>:<p className="shared-note">该线索暂无背调记录。</p>}
    </section>
    <section id="prospecting-draft" tabIndex={-1} className="prospecting-subsection prospecting-section">
     <h3>定制开发信 · 邮件草稿</h3>
     <form onSubmit={e=>{e.preventDefault();mutation.run('outreach_draft_email',{payload:{leadId,subject,body}});}}>
      <fieldset className="prospecting-fieldset" disabled={disabled}>
       <div className="form-grid">
        <label className="full">主题<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="邮件主题"/></label>
        <label className="full">正文<textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="邮件正文，仅保存草稿，不会发送。"/></label>
       </div>
       <div className="form-actions"><button type="submit" className="button primary" disabled={disabled}>保存新草稿版本</button></div>
      </fieldset>
     </form>
     <div className="shared-actions"><button type="button" className="button primary" disabled={disabled||!leadReports.length||!subject.trim()||!body.trim()} onClick={()=>mutation.run('outreach_audit_submit',{payload:{leadId,draft:{subject,body}}})}>提交开发信互审</button></div>
     <p className="shared-note">互审绑定最新已接受背调；至少一席独立审计，高置信自动批准并回写，低置信进入人工审批。回写 ≠ 已发信。</p>
     <ResourceState {...outreachAudits}/>
     {(outreachAudits.data?.items.filter(a=>a.lead_id===leadId)??[]).map(a=><OutreachAuditCard key={a.id} task={a} disabled={disabled} run={mutation.run}/>)}
     <h3>草稿版本</h3>
     {leadDrafts.length?<ul className="shared-timeline">{leadDrafts.map(d=><li key={d.id}>
      <div className="prospecting-draft-head"><strong>{d.subject||'（无主题）'}</strong><Status value={d.state==='pending'?'pending_approval':d.state??'draft'}/></div>
      <small>{when(d.created_at)}</small>
      <pre className="prospecting-body">{d.body}</pre>
      {d.state==='draft'&&<div className="shared-actions">
       <button className="button" disabled={disabled} onClick={()=>{setSubject(d.subject??'');setBody(d.body??'');}}>载入编辑（另存新版本）</button>
       <button className="button primary" disabled={disabled} onClick={()=>mutation.run('outreach_submit_approval',{payload:{draftId:d.id}})}>提交人工审批</button>
      </div>}
     </li>)}</ul>:<p className="shared-note">该线索暂无草稿。填写主题与正文后保存，会生成第一版草稿。</p>}
    </section>
   </div>
  </>}
 </Panel>
 </div>
 </div>
 <div id="prospecting-approval" tabIndex={-1} className="prospecting-section">
 <Panel title="背调人工例外队列">
  <ResourceState {...audits}/>
  <p className="shared-note">展示最近 500 项中的待人工背调，确认后保存融合摘要。</p>
  {(audits.data?.items.filter(a=>a.status==='needs_human'&&a.fusion&&!a.human_decision)??[]).map(a=><section key={a.id} className="prospecting-subsection">
   <h3>{leads.data?.items.find(l=>l.id===a.lead_id)?.email??a.lead_id}</h3>
   <p>一致率 {Math.round((a.fusion?.agreement_ratio??0)*100)}%</p>
   <pre className="prospecting-body">{a.fusion?.summary}</pre>
   <ul>{a.fusion?.blockers.map(b=><li key={b}>{b}</li>)}</ul>
   <details><summary>生成稿、审计席与证据</summary><p>{a.draft.summary}</p>{a.reviews.map(r=><p key={r.seatId}>{r.seatId} · {r.summary}</p>)}{a.evidence.map(e=><p key={e.id}>{e.id} · {e.text} {e.url}</p>)}</details>
   <div className="shared-actions"><button className="button primary" disabled={disabled} onClick={()=>mutation.run('diligence_audit_decide',{payload:{auditId:a.id,decision:'accept',human_actor_id:actor.id}})}>人工确认落库</button><button className="button" disabled={disabled} onClick={()=>mutation.run('diligence_audit_decide',{payload:{auditId:a.id,decision:'reject',human_actor_id:actor.id}})}>驳回背调</button></div>
  </section>)}
 </Panel>
 <Panel title="人工审批队列">
  <p className="shared-note">人工闸门：待审由管理员人工批准或拒绝；已通过待通道。审批不会发送邮件。队列显示最近 100 项，独立展示全部线索。</p>
 <div id="prospecting-writeback" tabIndex={-1} className="prospecting-section"><h3>回写客户与跟进</h3><p className="shared-note">在“已批准”队列中回写客户与跟进，复用现有回写命令；回写 ≠ 已发信；仅保存客户与跟进，已通过待通道。</p></div>
  <div className="shared-toolbar prospecting-toolbar">
   <label>状态筛选<select value={state} onChange={e=>setState(e.target.value)}>{approvalStates.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <button className="button" disabled={disabled} onClick={queue.reload}>刷新队列</button>
  </div>
  <h3>{approvalStates.find(([value])=>value===state)?.[1]}</h3>
  <ResourceState {...queue}/>
  {queue.data&&!queue.data.items.length&&<div className="shared-empty">当前筛选下没有审批记录。</div>}
  {!!queue.data?.items.length&&<div className="shared-table-wrap"><table>
   <thead><tr><th>线索邮箱</th><th>邮件内容</th><th>状态</th><th>操作</th></tr></thead>
   <tbody>{queue.data.items.map(q=><tr key={q.id}>
    <td>{q.email||'—'}<div className="shared-note">审批编号 {q.id.slice(0,8)}…</div></td>
    <td className="prospecting-cell-wrap"><strong>{q.subject||'（无主题）'}</strong><details><summary className="prospecting-mail-summary">查看正文</summary><pre className="prospecting-body">{q.body}</pre></details></td>
    <td>{q.written_back_at?<span className="shared-feedback success" role="status">已回写客户与跟进；回写 ≠ 已发信</span>:<Status value={q.state==='pending'?'pending_approval':q.state??'pending'}/>}</td>
    <td><div className="shared-actions">
     {q.state==='pending'&&<>
      <button className="button primary" disabled={disabled} onClick={()=>mutation.run('outreach_approve',{payload:{approvalId:q.id,human_actor_id:actor.id}})}>人工批准</button>
      <button className="button" disabled={disabled} onClick={()=>mutation.run('outreach_reject',{payload:{approvalId:q.id,human_actor_id:actor.id}})}>人工拒绝</button>
     </>}
     {q.sent_at?<span>已经 Brevo 发送 {q.brevo_message_id?.slice(0,40)}</span>:q.brevo_send_started_at?<span>发送结果待核对</span>:q.state==='approved'&&<button className="button primary" disabled={disabled} onClick={()=>mutation.run('outreach_send_brevo',{payload:{approvalId:q.id}})}>经 Brevo 发送</button>}
     {q.state==='approved'&&!q.written_back_at&&<button className="button primary" disabled={disabled} onClick={()=>mutation.run('outreach_writeback',{payload:{approvalId:q.id}})}>回写客户与跟进</button>}
     {!!q.written_back_at&&q.customer_id&&<Link className="button" href={'/workspace/customers?focus='+encodeURIComponent(q.customer_id)}>查看客户与跟进</Link>}
     {q.state==='rejected'&&<span className="shared-note">已拒绝，不执行回写。</span>}
    </div></td>
   </tr>)}</tbody>
  </table></div>}
 </Panel>
 </div>
 </>;
}

function OutreachAuditCard({task,disabled,run}:{task:z.infer<typeof outreachAuditsSchema>['items'][number];disabled:boolean;run:(action:string,input:Record<string,unknown>)=>unknown}){
 const [reviewJson,setReviewJson]=useState(''),[error,setError]=useState('');
 function record(){
  try{
   const review=outreachReviewSchema.parse(JSON.parse(reviewJson));
   setError('');run('outreach_audit_record',{payload:{auditId:task.id,review}});
  }catch{setError('请填写有效的审计席 JSON，包含 seatId、subject、body、blockers。');}
 }
 return <section className="prospecting-subsection">
  <h3>{task.status==='auto_approved'?'高置信自动批准':task.fusion?'低置信已转人工审批':'等待开发信审计 / 融合'} · {task.id.slice(0,8)}</h3>
  {!!task.written_back_at&&<p className="shared-feedback success">已回写客户与跟进；回写 ≠ 已发信</p>}
  <details><summary>绑定背调与草稿</summary><small>背调 {task.report_id}</small><pre className="prospecting-body">{task.report_summary}</pre><strong>{task.draft.subject}</strong><pre className="prospecting-body">{task.draft.body}</pre></details>
  <p className="shared-note">审计席 {task.reviews.map(r=>r.seatId).join('、')||'暂无'}{task.fusion&&` · 一致率 ${Math.round(task.fusion.agreement_ratio*100)}%`}</p>
  {task.fusion?.blockers.map(b=><p className="shared-note" key={b}>{b}</p>)}
  {!task.fusion&&<>
   <label>独立审计席 JSON<textarea value={reviewJson} onChange={e=>setReviewJson(e.target.value)} placeholder='{"seatId":"audit","subject":"主题","body":"正文","blockers":[]}' disabled={disabled}/></label>
   {error&&<p role="alert">{error}</p>}
   <div className="shared-actions"><button className="button" disabled={disabled||!reviewJson.trim()} onClick={record}>记录审计席</button><button className="button primary" disabled={disabled} onClick={()=>run('outreach_audit_fuse',{payload:{auditId:task.id}})}>融合并执行闸门 A</button></div>
  </>}
 </section>;
}
