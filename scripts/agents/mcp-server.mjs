import {createInterface} from 'node:readline';
import {createTools} from './tools.mjs';
// Credentials belong to the local operator's process, never to tool arguments.
import {read,write} from './business-read.mjs';
const api=createTools({companyId:process.env.AGENT_COMPANY_ID,roleCode:process.env.AGENT_ROLE_CODE??'prospecting',read,write});
async function handle(message){if(message.method==='initialize')return {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'siliantai-semiautomatic',version:'0.1.0'}};if(message.method==='ping')return {};if(message.method==='tools/list')return {tools:await api.listCurrent()};if(message.method==='tools/call'){try{return {content:[{type:'text',text:JSON.stringify(await api.call(message.params?.name,message.params?.arguments))}]};}catch{return {isError:true,content:[{type:'text',text:'Operation denied or unavailable; verify scope, arguments and session.'}]};}}throw Error('METHOD_NOT_FOUND');}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){let msg;try{if(line.length>100000)throw Error();msg=JSON.parse(line);if(msg.id===undefined)continue;const result=await handle(msg);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result})+'\n');}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg?.id??null,error:{code:-32600,message:'Invalid or unsupported request'}})+'\n');}}
