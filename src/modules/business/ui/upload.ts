'use client';
import {useRef,useState} from 'react';
import {z} from 'zod';
import {sendData} from './client';
const resultSchema=z.object({id:z.string().uuid()});
export function useFileUpload(){const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');const current=useRef<{key:string;requestId:string;id?:string}|null>(null);
 async function upload(file:File,orderId:string|null,category:'customer'|'purchase'|'customs'|'signature'|'origin',record?:{recordKind:'product'|'supplier';recordId:string}){
  setBusy(true);setError('');setProgress(0);
  try{
   if(file.size>(category==='signature'?2097152:10485760)||!file.size)throw new Error('文件超过大小限制。');
   const bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   const key=JSON.stringify({orderId,category,...record,name:file.name,size:file.size,hash});if(!current.current||current.current.key!==key)current.current={key,requestId:crypto.randomUUID()};
   const state=current.current;
   if(!state.id){const result=resultSchema.parse(await sendData(category==='signature'?'signature.intent':category==='origin'?'origin.intent':'file.intent',{requestId:state.requestId,orderId,category,...record,name:file.name,mime:file.type,size:file.size,sha256:hash}));state.id=result.id;}
   const chunkSize=2097152,count=Math.ceil(file.size/chunkSize);
   for(let part=0;part<count;part++){const form=new FormData();form.set('id',state.id);form.set('part',String(part));form.set('chunk',new Blob([bytes.slice(part*chunkSize,Math.min(file.size,(part+1)*chunkSize))]));const response=await fetch('/api/workspace/files',{method:'POST',body:form});if(!response.ok)throw new Error('上传未完成，请保留所选文件重试；已有分片会核对后复用。');setProgress(Math.round((part+1)/count*90));}
   await sendData('file.finish',{id:state.id});setProgress(100);return state.id;
  }catch(error){setError(error instanceof Error?error.message:'上传失败，请重试原文件。');return undefined;}finally{setBusy(false);}
 }
 return {upload,busy,progress,error};
}
