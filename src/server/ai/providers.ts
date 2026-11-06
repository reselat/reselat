import {z} from 'zod';
import type {ModelProvider} from '@/modules/settings/model-schema';
export type ModelConfig={key:string;model:string;inputPrice:bigint;outputPrice:bigint;dailyBudget:bigint;dailyCalls:number;provider?:ModelProvider;profileId?:string;profileVersion?:number};
const endpoints:Record<ModelProvider,string>={deepseek:'https://api.deepseek.com/chat/completions',openai:'https://api.openai.com/v1/chat/completions','qwen-cn':'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','qwen-intl':'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'};
const receipt=z.object({id:z.string().max(200),model:z.string().max(100),choices:z.array(z.object({finish_reason:z.literal('stop'),message:z.object({content:z.string().max(20000)})})).length(1),usage:z.object({prompt_tokens:z.number().int().min(0).max(16384),completion_tokens:z.number().int().min(0).max(1024)})});
export async function callModelJson<T>(config:ModelConfig,messages:{role:string;content:string}[],validate:(raw:unknown)=>T,fetcher:typeof fetch=fetch,onReceipt:(body:string)=>Promise<void>=async()=>{}){
 if(Buffer.byteLength(messages.map(m=>m.content).join(''),'utf8')>8192)throw new Error('AI_INPUT_LIMIT');
 const provider=config.provider??'deepseek',body={model:config.model,messages,response_format:{type:'json_object'},stream:false,...(provider==='openai'?{max_completion_tokens:1024,store:false}:provider==='deepseek'?{max_tokens:1024,thinking:{type:'disabled'}}:{max_tokens:1024,enable_thinking:false})};
 const response=await fetcher(endpoints[provider],{method:'POST',redirect:'error',headers:{authorization:'Bearer '+config.key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('AI_PROVIDER_REJECTED');
 const reader=response.body?.getReader();if(!reader)throw new Error('AI_RESULT_UNKNOWN');let size=0;const chunks:Uint8Array[]=[];try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>65536){await reader.cancel();throw new Error('AI_RESULT_UNKNOWN');}chunks.push(p.value);}}finally{reader.releaseLock();}
 const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));await onReceipt(text);const parsed=receipt.parse(JSON.parse(text)),answer=validate(JSON.parse(parsed.choices[0].message.content));return {answer,receipt:{body:text,providerId:parsed.id,provider,model:parsed.model,inputTokens:parsed.usage.prompt_tokens,outputTokens:parsed.usage.completion_tokens}};
}
