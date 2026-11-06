const base=new URL(process.env.AGENT_BUSINESS_ORIGIN??'http://127.0.0.1:3000');
if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('HTTPS_REQUIRED');
export async function read(params){const url=new URL('/api/workspace/business',base);url.search=params.toString();const response=await fetch(url,{headers:{'x-agent-company-id':process.env.AGENT_COMPANY_ID,cookie:process.env.AGENT_SESSION_COOKIE??''},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('BUSINESS_READ_FAILED');const body=await response.json();if(body.ok!==true)throw Error('BUSINESS_READ_FAILED');return body.data;}
export async function write(action,input,{roleCode}={}){
 const url=new URL('/api/workspace/business',base);
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(roleCode?{'x-agent-role-code':roleCode}:{}),origin:base.origin,'x-agent-company-id':process.env.AGENT_COMPANY_ID,cookie:process.env.AGENT_SESSION_COOKIE??''},body:JSON.stringify({action,input}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('BUSINESS_WRITE_FAILED');
 const body=await response.json();if(body.ok!==true)throw Error('BUSINESS_WRITE_FAILED');return body.data;
}
