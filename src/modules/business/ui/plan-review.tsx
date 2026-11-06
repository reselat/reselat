'use client';
import {useRef,useState} from 'react';
import {useMutation} from './client';
import {submitPlanReview,type ReviewPlan} from './plan-review-flow';
const fieldLabels={name:'姓名',email:'邮箱',subject:'主题',body:'正文',summary:'摘要'} as const;
export function PlanReview({plan,pipelines,onClose,onSaved}:{plan:ReviewPlan;pipelines:{id:string;name:string;enabled:unknown}[];onClose:()=>void;onSaved:()=>void}){
 const [snapshot,setSnapshot]=useState(plan),[edited,setEdited]=useState(plan),[blocked,setBlocked]=useState(false),[error,setError]=useState('');
 const submitting=useRef(false),mutation=useMutation(onSaved);
 async function confirm(){
  if(submitting.current||blocked)return;
  submitting.current=true;setError('');
  try{const result=await submitPlanReview(snapshot,edited,mutation.run,saved=>{setSnapshot(saved);setEdited(saved);});if(result!==undefined)onClose();else setBlocked(true);}
  catch{setError('保存结果缺少有效版本，请刷新列表后重新审阅。');setBlocked(true);}
  finally{submitting.current=false;}
 }
 return <article aria-label="计划审阅"><h2>审阅并确认计划</h2><p>计划 {snapshot.id} · 版本 {snapshot.version} · draft</p>
 <p>确认后方可加入队列；任务仍将在人工审批处等待。</p>
 <form onSubmit={e=>{e.preventDefault();void confirm();}}><fieldset disabled={mutation.busy||blocked||mutation.uncertain}>
 <label>流水线<select required value={edited.pipeline_id} onChange={e=>setEdited({...edited,pipeline_id:e.target.value})}>{pipelines.filter(p=>p.enabled||p.id===edited.pipeline_id).map(p=><option key={p.id} value={p.id}>{p.name}{!p.enabled?'（已停用）':''}</option>)}</select></label>
 {(['name','email','subject','body','summary'] as const).map(key=><label key={key}>{fieldLabels[key]}{key==='body'||key==='summary'?<textarea required={key==='body'} value={edited.input[key]??''} onChange={e=>setEdited({...edited,input:{...edited.input,[key]:e.target.value}})}/>:<input type={key==='email'?'email':'text'} required value={edited.input[key]} onChange={e=>setEdited({...edited,input:{...edited.input,[key]:e.target.value}})}/>}</label>)}
 <label>步骤说明<textarea required maxLength={10000} value={edited.steps} onChange={e=>setEdited({...edited,steps:e.target.value})}/></label>
 <button>确认计划</button></fieldset></form>
 <p role="alert">{error||mutation.error}</p>{blocked&&<p>本次流程已停止。请先核对未决提交，再关闭面板、刷新计划列表并重新审阅当前版本。</p>}
 {mutation.uncertain&&<button disabled={mutation.busy} onClick={mutation.retry}>核对上次提交</button>}
 <button disabled={mutation.busy||mutation.uncertain} onClick={onClose}>关闭审阅</button></article>;
}
