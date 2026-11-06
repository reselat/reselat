'use client';
import { useState } from 'react';
import { useWorkspace } from './store';
import { companySchema } from './model';
import { FormError,LocalNotice,errorMessage } from './ui';
export function Settings(){const {state,ready,problem,update}=useWorkspace();const [error,setError]=useState(''),[message,setMessage]=useState('');if(!ready)return <p>读取公司资料…</p>;
 function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();try{const company=companySchema.parse(Object.fromEntries(new FormData(e.currentTarget)));update(s=>({...s,revision:s.revision+1,company}));setMessage('公司资料已保存，仅影响后续新建订单的抬头快照。');setError('');}catch(e){setError(errorMessage(e));}}
 return <><div className="page-heading"><div><h1>公司与单据设置</h1><p>单据中的卖方抬头、地址和收款资料来源。</p></div></div><LocalNotice/><FormError message={problem||error}/>{message&&<p role="status" className="success">{message}</p>}<section className="panel"><form onSubmit={save}><div className="form-grid">{[['name','公司英文抬头'],['address','公司英文地址'],['country','国家'],['email','业务邮箱'],['phone','电话'],['bankName','收款银行名称'],['bankAccount','收款账号（只输入测试资料）'],['swift','SWIFT / BIC']].map(([name,label])=><label key={name}>{label}<input name={name} required={['name','address','country'].includes(name)} type={name==='email'?'email':'text'} defaultValue={state.company[name as keyof typeof state.company]} maxLength={name==='name'?120:name==='address'?200:name==='email'?100:name==='phone'?40:name==='country'?60:500}/></label>)}</div><div className="form-actions"><button className="button primary">保存公司设置</button></div></form></section><div className="inline-banner">签名／印章授权尚未连接受控身份系统，本轮不开放真实签名原图上传。</div></>;
}
