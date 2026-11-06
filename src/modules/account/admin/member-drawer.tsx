'use client';
import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {ROLE_LABELS,ROLE_DESCRIPTIONS,roles,type Role} from './roles';
import {creationFailureMessage} from './create-errors';
import {checkedJson,type Member} from './types';
export function MemberDrawer({member,onClose,onSaved,adminCount}:{member:Member|null;onClose:()=>void;onSaved:(message:string)=>void;adminCount:number}){
 const dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null),requestId=useRef(crypto.randomUUID());
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[role,setRole]=useState<Role>(member?.role||'sales');
 useEffect(()=>{const target=dialog.current;target?.showModal();return()=>target?.close();},[]);
 const lastAdmin=Boolean(member?.role==='admin'&&member.enabled&&adminCount<=1);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError('');const fields=new FormData(e.currentTarget);try{
 const body=member?{id:member.id,version:member.version,name:String(fields.get('name')),role}:{requestId:requestId.current,name:String(fields.get('name')),email:String(fields.get('email')),password:String(fields.get('password')),role};
 const response=await fetch(member?'/api/admin/employees':'/api/admin/employees/provision',{method:member?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const json=await checkedJson(response);
 if(!member){const result=z.object({status:z.string(),errorCode:z.string().optional()}).parse(json);if(result.status==='rejected'){setError(creationFailureMessage(result.errorCode)+' 修正后请重新打开添加面板提交。');return;}if(result.status!=='completed'){onSaved('创建结果待核对。请在“待处理创建”中检查，勿反复创建账号。');return;}}
 onSaved(member?'成员信息已更新。':'成员账号已创建，可使用设置的初始密码登录。');
 }catch(e){setError(e instanceof Error?e.message:'操作未完成，请稍后重试。');}finally{const password=form.current?.elements.namedItem('password');if(password instanceof HTMLInputElement)password.value='';setBusy(false);}}
 return <dialog className="am-drawer" ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else onClose();}} aria-labelledby="am-drawer-title"><form ref={form} onSubmit={submit}>
 <header><div><h2 id="am-drawer-title">{member?'编辑成员':'添加成员'}</h2><p>{member?'更新姓名和访问角色':'创建员工登录账号，不发送邮件'}</p></div><button type="button" className="am-icon-button" aria-label="关闭编辑面板" onClick={onClose} disabled={busy}>×</button></header>
 <div className="am-drawer-body">{error&&<p className="am-error" role="alert">{error}</p>}<label>成员姓名<input autoFocus name="name" required maxLength={80} defaultValue={member?.name} placeholder="填写姓名" autoComplete="name"/></label>
 {!member&&<><label>登录邮箱<input name="email" type="email" required maxLength={254} autoComplete="off" placeholder="name@company.com"/></label><label>初始密码<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder="至少 12 个字符"/><small>仅本次提交使用，请通过公司认可的方式交给员工。</small></label></>}
 <fieldset><legend>分配角色</legend>{roles.map(value=><label className={'am-role-option '+(role===value?'selected':'')} key={value}><input type="radio" name="role" value={value} checked={role===value} disabled={busy||(lastAdmin&&value!=='admin')} onChange={()=>setRole(value)}/><span><b>{ROLE_LABELS[value]}</b><small>{ROLE_DESCRIPTIONS[value]}</small></span></label>)}</fieldset>
 {lastAdmin&&<p className="am-note">当前是最后一位启用的管理员，需先添加另一位管理员才能降级。</p>}
 </div><footer><button type="button" className="am-button" onClick={onClose} disabled={busy}>取消</button><button className="am-button primary" disabled={busy}>{busy?'正在保存…':member?'保存修改':'创建成员'}</button></footer></form></dialog>;
}
