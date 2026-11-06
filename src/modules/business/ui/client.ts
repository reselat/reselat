'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
const envelope=z.object({ok:z.boolean().optional(),data:z.unknown().optional(),message:z.string().optional(),code:z.string().optional()});
const labels:Record<string,string>={MFA_REQUIRED:'请先完成双重验证。',FORBIDDEN:'当前账号没有执行此操作的权限。',NOT_CONFIGURED:'服务配置尚未就绪，请联系管理员。',UNAUTHENTICATED:'登录已失效，请重新登录。',RESULT_UNKNOWN:'提交结果尚未确认，请重试原请求核对。'};
export class ClientFailure extends Error{constructor(message:string,public uncertain=false){super(message);}}
export async function readData<T>(query:Record<string,string>,schema:z.ZodType<T>,signal?:AbortSignal):Promise<T>{const response=await fetch('/api/workspace/business?'+new URLSearchParams(query),{cache:'no-store',signal});const payload=envelope.parse(await response.json());if(!response.ok||!payload.ok)throw new ClientFailure(payload.message??labels[payload.code??'']??'读取失败，请刷新后重试。');return schema.parse(payload.data);}
export async function sendData(action:string,input:unknown){let response:Response,payload:z.infer<typeof envelope>;
 try{response=await fetch('/api/workspace/business',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,input})});payload=envelope.parse(await response.json());}catch{throw new ClientFailure('提交结果尚未确认，请保留原内容重试。',true);}
 if(!response.ok||!payload.ok)throw new ClientFailure(payload.message??labels[payload.code??'']??'操作未完成，请核对字段和当前状态。',payload.code==='RESULT_UNKNOWN');return payload.data;
}
export function useResource<T>(query:Record<string,string>,schema:z.ZodType<T>,enabled=true){const key=new URLSearchParams(query).toString(),[revision,setRevision]=useState(0),[snapshot,setSnapshot]=useState<{key:string;data?:T;error:string}>({key:'',error:''}),requestKey=key+'|'+revision;
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();readData(Object.fromEntries(new URLSearchParams(key)),schema,controller.signal).then(data=>{if(!controller.signal.aborted)setSnapshot({key:requestKey,data,error:''});}).catch(error=>{if(!controller.signal.aborted)setSnapshot({key:requestKey,error:error instanceof Error?error.message:'读取失败'});});return()=>controller.abort();},[key,schema,requestKey,enabled]);
 return {data:snapshot.key===requestKey?snapshot.data:undefined,error:enabled&&snapshot.key===requestKey?snapshot.error:'',loading:enabled&&snapshot.key!==requestKey,reload:useCallback(()=>setRevision(v=>v+1),[])};
}
export function useMutation(refresh?:()=>void){const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false);const pending=useRef<{action:string;input:Record<string,unknown>;key:string}|null>(null);
 const run=async(action:string,input:Record<string,unknown>)=>{
  const key=action+JSON.stringify(input);if(pending.current&&pending.current.key!==key){setError('上次提交结果尚未确认，请先点击“核对上次提交”，再修改内容。');return undefined;}
  const command=pending.current??{action,input:{...input,requestId:crypto.randomUUID()},key};pending.current=command;setUncertain(false);setBusy(true);setError('');setMessage('');
  try{const result=await sendData(command.action,command.input);pending.current=null;setMessage('操作成功，已保存到共享业务库。');refresh?.();return result??{};}catch(error){if(!(error instanceof ClientFailure)||!error.uncertain)pending.current=null;setUncertain(!!pending.current);setError(error instanceof Error?error.message:'操作未完成');return undefined;}finally{setBusy(false);}
 };
 const retry=async()=>{if(!pending.current)return;const {action,input}=pending.current;setBusy(true);setError('');try{await sendData(action,input);pending.current=null;setUncertain(false);setMessage('已核对并确认提交成功。');refresh?.();}catch(error){if(!(error instanceof ClientFailure)||!error.uncertain)pending.current=null;setUncertain(!!pending.current);setError(error instanceof Error?error.message:'核对失败');}finally{setBusy(false);}};
 return {run,retry,busy,error,message,uncertain:uncertain&&!busy};
}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());}
export function text(value:unknown){return typeof value==='string'?value:typeof value==='number'?String(value):'';}
