'use client';
import {PlanReview} from './plan-review';
import {reviewPlan,type ReviewPlan} from './plan-review-flow';
import {RunObservation,observationDTO} from './run-observation';
import {useState} from 'react';
import {z} from 'zod';
import {useResource,useMutation,text} from './client';
const fieldLabels:Record<string,string>={name:'姓名',email:'邮箱',subject:'主题',body:'正文',summary:'摘要'};
const row=z.record(z.string(),z.unknown()),list=z.object({items:z.array(row)}),detail=z.object({run:row.optional(),steps:z.array(row),declarations:z.array(row)}).extend(observationDTO.shape);
export function AgentRuns(){
 const [review,setReview]=useState<ReviewPlan|null>(null);
 const [id,setId]=useState('');
 const roles=useResource({view:'agent-roles'},list);
 const plans=useResource({view:'agent-plans'},list);
 const runs=useResource({view:'agent-runs'},list),pipelines=useResource({view:'agent-pipelines'},list),selected=useResource({view:'agent-run',id},detail,!!id);
 const mutation=useMutation(()=>{runs.reload();pipelines.reload();plans.reload();selected.reload();});
 return <section><h1>任务中心</h1><p>本机编排 · 等待人工审批时仅展示证据，不执行审批或发送。</p>
 <button onClick={()=>{runs.reload();roles.reload();plans.reload();pipelines.reload();selected.reload();}}>刷新</button>
 <p role="alert">{roles.error||plans.error||runs.error||pipelines.error||selected.error||mutation.error}</p><p role="status">{mutation.message}</p>
 {mutation.uncertain&&<button onClick={mutation.retry}>核对上次提交</button>}
 <h2>岗位 Agent（只读）</h2>{roles.data?.items.map(r=><article key={text(r.code)}><h3>{text(r.display_name)} · {text(r.code)}</h3><p>{r.enabled?'已启用':'已停用'} · 版本 {text(r.version)}</p><p>{text(r.system_prompt)}</p><pre>{Array.isArray(r.allowed_actions)?(r.allowed_actions.map(v=>text(v)).join(', ')||'—'):text(r.allowed_actions)}</pre>{Array.isArray(r.skills)&&r.skills.map((skill)=><details key={text(skill.id)}><summary>技能 {text(skill.id)} · {text(skill.description)}</summary><pre>{text(skill.content)}</pre></details>)}</article>)}
 <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await mutation.run('pipeline_upsert',{payload:{id:crypto.randomUUID(),name:String(f.get('pipelineName')),enabled:true}});}}><h2>创建流水线</h2><input name="pipelineName" aria-label="Pipeline 名称" required maxLength={100}/><button disabled={mutation.busy}>创建</button></form>
 <form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);const result=await mutation.run('plan_upsert',{payload:{id:crypto.randomUUID(),pipelineId:String(f.get('pipeline')),input:Object.fromEntries(['name','email','subject','body'].map(k=>[k,String(f.get(k))])),steps:String(f.get('steps'))}});if(result)form.reset();}}><h2>草稿计划</h2><select name="pipeline" aria-label="Pipeline" required defaultValue=""><option value="">选择流水线</option>{pipelines.data?.items.filter(p=>p.enabled).map(p=><option key={text(p.id)} value={text(p.id)}>{text(p.name)}</option>)}</select>{['name','email','subject','body'].map(k=><label key={k}>{fieldLabels[k]}<input name={k} type={k==='email'?'email':'text'} required/></label>)}<label>步骤说明<textarea name="steps" required maxLength={10000} defaultValue={'建立线索 → 保存尽调 → 生成邮件草稿 → 提交人工审批（不发送）'}/></label><button disabled={mutation.busy}>保存草稿计划</button></form>
 {review&&<PlanReview key={review.id} plan={review} pipelines={(pipelines.data?.items??[]).map(p=>({id:text(p.id),name:text(p.name),enabled:p.enabled}))} onClose={()=>setReview(null)} onSaved={()=>{plans.reload();runs.reload();}}/>}
 <h2>计划：草稿 → 确认 → 入队</h2>{plans.data?.items.map(p=><article key={text(p.id)}><h3>{text(p.id)} · {text(p.state)}</h3><pre>{JSON.stringify(p.input,null,2)}</pre><p>{text(p.steps)}</p>{p.state==='draft'?<><button disabled={mutation.busy||!!review} onClick={()=>setReview(reviewPlan.parse(p))}>审阅并确认</button></>:p.state==='confirmed'?<button disabled={mutation.busy} onClick={()=>mutation.run('run_enqueue',{payload:{pipelineId:p.pipeline_id,planId:p.id}})}>加入队列</button>:null}</article>)}
 {runs.loading&&<p>加载中…</p>}<table><thead><tr>{['任务 ID','计划 ID','流水线','状态','创建时间','开始时间','结束时间','租约持有者 / 到期'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{runs.data?.items.map(r=><tr key={text(r.id)}><td><button onClick={()=>setId(text(r.id))}>{text(r.id)}</button></td><td>{text(r.plan_id)||'—'}</td><td>{pipelines.data?.items.find(p=>p.id===r.pipeline_id)?.name as string||text(r.pipeline_id)}</td>{['state','created_at','started_at','finished_at'].map(k=><td key={k}>{text(r[k])||'—'}</td>)}<td>{text(r.lease_owner)} / {text(r.lease_until)}</td></tr>)}</tbody></table>
 {id&&<article><h2>任务 {id}</h2><p>{text(selected.data?.run?.state)} · pending 审批请由人工在既有审批闸门处理。</p><button disabled={mutation.busy} onClick={()=>mutation.run('run_cancel',{payload:{id}})}>急停任务</button><button disabled={mutation.busy} onClick={()=>mutation.run('run_requeue',{payload:{id}})}>失败／租约过期补跑</button><p>补跑资格由服务端校验。结构化步骤图为执行依据，Plan 步骤文案仅作说明。</p><table><thead><tr><th>步骤</th><th>岗位</th><th>依赖</th><th>状态</th></tr></thead><tbody>{selected.data?.declarations.map(s=><tr key={text(s.step_key)}><td>{text(s.step_key)}</td><td>{text(s.role_code)}</td><td>{Array.isArray(s.depends_on)?s.depends_on.join(', '):'—'}</td><td>{text(s.state)}</td></tr>)}</tbody></table>{selected.data&&<RunObservation timeline={selected.data.timeline} usage={selected.data.usage}/>}</article>}
 </section>;
}
