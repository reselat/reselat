'use client';
import {BrandLogo} from '@/modules/appearance/brand';
import {createContext,useContext,useRef,useEffect,useEffectEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {formatMinor} from '@/domain/money';
import {currencySchema,currencyScale} from '@/modules/workspace/model';
import {Logout} from '@/modules/account/logout';
import {RiskIndicator} from '@/modules/finance/notification-indicator';
import {text,type useMutation} from './client';
type Actor={id:string;role:'admin'|'sales'|'operations'};
const ActorContext=createContext<Actor|null>(null);
export function useActor(){const actor=useContext(ActorContext);if(!actor)throw new Error('ACTOR_CONTEXT_MISSING');return actor;}
const navGroups = [
  {label:'增长',items:[['prospecting','获客工作台'],['customers','客户与跟进'],['assistant','客户接待与交接']]},
  {label:'履约',items:[['orders','销售订单'],['purchases','采购与到货'],['documents','单据中心'],['shipments','出运装箱']]},
  {label:'资产',items:[['catalog','产品与HS'],['suppliers','供应商'],['knowledge','企业知识与报价']]},
  {label:'财务',items:[['payments','业务收付款'],['expenses','费用申请与报销'],['costs','订单成本分析'],['risks','业务风险中心'],['refunds','退税资料'],['signatures','签名印章'],['settings','我方公司资料']]},
];
function visibleNavItem(key:string,role:Actor['role']) {
  return !(role==='sales'&&['purchases','suppliers','signatures'].includes(key))&&!(role!=='admin'&&['settings','audit','suppliers','costs','prospecting'].includes(key));
}
function workspaceHref(key:string) {return '/workspace'+(key?'/'+key:'');}
export function WorkspaceNavigation({role,path,localTest=process.env.NEXT_PUBLIC_RESELAT_LOCAL_TEST==='1'}:{role:Actor['role'];path:string;localTest?:boolean}) {
  const renderLink = ([key,label]:string[]) => {
    const href=workspaceHref(key);
    const active=path===href||(key!==''&&path.startsWith(href+'/'));
    return <Link key={key} className={active?'active':''} aria-current={active?'page':undefined} href={href}>{label}</Link>;
  };
  return <nav aria-label="业务模块">
    <Link href="/workspace/management" className={path==='/workspace/management'||path==='/workspace'?'active':''} aria-current={path==='/workspace/management'||path==='/workspace'?'page':undefined}>指挥台</Link>
    {role==='admin'&&localTest&&<div className="shared-agent-entry"><span>Agent 底座</span>{renderLink(['agent-runs','任务中心'])}</div>}
    {navGroups.map(group=>{
      const items=group.items.filter(([key])=>visibleNavItem(key,role));
      if(!items.length)return null;
      const current=items.some(([key])=>path===workspaceHref(key)||(key!==''&&path.startsWith(workspaceHref(key)+'/')));
      return <details className={'shared-nav-group'+(current?' current':'')} key={group.label+path} open={current}>
        <summary>{group.label}</summary>
        <div className="shared-nav-items">{items.map(renderLink)}</div>
      </details>;
    })}
    <details className="shared-nav-group" key={'settings'+path} open={['/workspace/system-settings','/workspace/ai-settings','/workspace/handover','/workspace/uploads','/workspace/audit'].includes(path)}><summary>设置</summary><div className="shared-nav-items"><Link href="/workspace/system-settings" aria-current={path==='/workspace/system-settings'?'page':undefined}>设置中心</Link><Link href="/account/settings">个人资料与账号安全</Link>{role==='admin'&&<><Link href="/admin">员工资料与角色</Link><Link href="/workspace/ai-settings" aria-current={path==='/workspace/ai-settings'?'page':undefined}>AI大模型设置</Link><Link href="/workspace/handover">员工离职交接</Link><Link href="/workspace/uploads">上传维护</Link><Link href="/workspace/audit">业务操作记录</Link></>}</div></details>
  </nav>;
}
export function WorkspaceShell({actor,children}:{actor:Actor;children:ReactNode}) {
  const path=usePathname();
  return <ActorContext value={actor}><div className="shared-shell">
    <aside className="shared-nav">
      <Link className="shared-brand" href="/workspace"><BrandLogo/><strong>思链台<small>外贸业务工作台</small></strong></Link>
      <WorkspaceNavigation role={actor.role} path={path}/>
      <div className="shared-nav-foot"><span>{actor.role==='admin'?'管理员':actor.role==='sales'?'业务员':'运营'}</span><Link href="/account/settings">个人账号设置</Link><Logout/></div>
    </aside>
    <main className="shared-main"><div className="shared-top"><span>共享业务工作空间</span><RiskIndicator/><span className="shared-status">● 独立业务数据库</span></div><div className="shared-content">{children}</div></main>
  </div></ActorContext>;
}
export function Heading({title,description,children}:{title:string;description?:string;children?:ReactNode}){return <div className="page-heading"><div><div className="shared-eyebrow">TRADE WORKSPACE</div><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="quick-links">{children}</div></div>;}
export function ResourceState({loading,error,reload}:{loading:boolean;error:string;reload:()=>void}){return error?<div className="shared-feedback error" role="alert">{error}<button className="button" onClick={reload}>重新加载</button></div>:loading?<p className="muted" role="status">正在读取共享资料…</p>:null;}
export function MutationState({state}:{state:ReturnType<typeof useMutation>}){return <>{state.error&&<div className="shared-feedback error" role="alert">{state.error}{state.uncertain&&<button className="button" disabled={state.busy} onClick={()=>state.retry()}>核对上次提交</button>}</div>}{state.message&&<p className="shared-feedback success" role="status">{state.message}</p>}</>;}
export function Panel({title,children}:{title?:string;children:ReactNode}){return <section className="panel shared-panel">{title&&<h2>{title}</h2>}{children}</section>;}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){const dialog=useRef<HTMLElement>(null),close=useEffectEvent(onClose);useEffect(()=>{const previous=document.activeElement;const panel=dialog.current;panel?.querySelector<HTMLElement>('button,input,select,textarea,a[href]')?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'&&panel){const nodes=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(node=>node.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous instanceof HTMLElement)previous.focus();};},[]);return <div className="shared-overlay"><section ref={dialog} className="shared-dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="button" onClick={onClose} aria-label="关闭表单">关闭</button></header>{children}</section></div>;}
export type Field={key:string;label:string;required?:boolean;type?:'date'|'number'|'email'|'textarea';options?:readonly string[];max?:number;readOnly?:boolean};
export function Fields({fields,defaults={}}:{fields:Field[];defaults?:Record<string,unknown>}){return <div className="form-grid">{fields.map(field=><label key={field.key} className={field.type==='textarea'?'full':''}>{field.label}{field.type==='textarea'?<textarea name={field.key} required={field.required} maxLength={field.max??2000} defaultValue={text(defaults[field.key])}/>:field.options?<select name={field.key} required={field.required} defaultValue={text(defaults[field.key])||field.options[0]}>{field.options.map(v=><option key={v}>{v}</option>)}</select>:<input name={field.key} type={field.type??'text'} required={field.required} readOnly={field.readOnly} maxLength={field.max??500} defaultValue={text(defaults[field.key])} step={field.type==='number'?'0.0001':undefined}/>}</label>)}</div>;}
export function Submit({busy,label='保存共享资料',disabled=false}:{busy:boolean;label?:string;disabled?:boolean}){return <div className="form-actions"><button className="button primary" disabled={busy||disabled}>{busy?'处理中…':label}</button></div>;}
export function Pagination({offset,more,onChange}:{offset:number;more:boolean;onChange:(n:number)=>void}){return <div className="shared-pagination"><button className="button" disabled={!offset} onClick={()=>onChange(Math.max(0,offset-50))}>上一页</button><span>第 {Math.floor(offset/50)+1} 页</span><button className="button" disabled={!more} onClick={()=>onChange(offset+50)}>下一页</button></div>;}
const states:Record<string,string>={draft:'草稿',submitted:'待确认',confirmed:'已确认',fulfilling:'履约中',completed:'已完成',cancelled:'已取消',pending:'待确认',approved:'已批准',rejected:'已拒绝',pending_approval:'待审批',active:'有效',void:'已作废',stored:'已归档',rendering:'生成中',needs_reconciliation:'待核对',uploading:'上传处理中',missing:'待补件',uploaded:'已上传',pending_review:'待复核',reviewed:'已复核',not_applicable:'不适用'};
export function Status({value}:{value:string}){return <span className={'shared-badge '+(['confirmed','approved','active','completed','stored','reviewed'].includes(value)?'good':['cancelled','void','rejected'].includes(value)?'neutral':'pending')}>{states[value]??value}</span>;}
export function Money({amount,currency}:{amount:string;currency:string}){const result=currencySchema.safeParse(currency);let formatted=amount;try{if(result.success)formatted=formatMinor(BigInt(amount),currencyScale[result.data]);}catch{}return <span className="shared-money">{currency} {formatted}</span>;}
