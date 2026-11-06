export type ProspectingStep='discover'|'diligence'|'draft'|'approval'|'writeback';
const steps=[['discover','发现 / 搜客','新增或导入线索'],['diligence','筛选 / 背调','记录背景与风险'],['draft','定制开发信','保存草稿版本'],['approval','人工审批','待审 / 人工决定'],['writeback','回写客户','已通过待通道 · 客户跟进']] as const;
export function currentProspectingStep(selected:boolean,hasReport:boolean,draftState?:string):ProspectingStep{
 if(!selected)return 'discover';
 if(draftState==='pending')return 'approval';
 if(draftState==='approved')return 'writeback';
 if(draftState==='draft'||draftState==='rejected')return 'draft';
 return hasReport?'draft':'diligence';
}
export function ProspectingPipeline({current}:{current:ProspectingStep}){
 return <nav aria-label="获客流水线" className="prospecting-pipeline"><ol>{steps.map(([id,label,description],index)=><li key={id}><a href={'#prospecting-'+id} aria-current={current===id?'step':undefined}><span>{index+1} · {label}</span><small>{description}</small></a></li>)}</ol></nav>;
}
