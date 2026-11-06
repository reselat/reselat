import {z} from 'zod';
import {requireEmployee} from '@/server/auth/session';
import {sameOrigin,accountError} from '@/server/auth/http';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
const labels:Record<string,string>={BREVO_CONFIG_REQUIRED:'请配置服务端 BREVO_API_KEY 与 BREVO_SENDER_EMAIL。',BREVO_ALREADY_STARTED:'此草稿已有发送记录，请核对发送结果。',BREVO_REJECTED:'Brevo 拒绝请求，请管理员核对配置与发送记录。',BREVO_RESULT_UNKNOWN:'发送结果不确定，请管理员在 Brevo 核对，避免重复发送。',DILIGENCE_REQUIRED:'请先完成该线索背调互审并自动接受或人工确认落库，再提交定制开发信。',INVALID_EVIDENCE:'证据引用无效，请核对来源编号。',DUPLICATE_SEAT:'该审计席已提交，请使用独立席位。',DEPENDENCY_NOT_READY:'前置步骤尚未成功，不能推进。',INVALID_STEPS_GRAPH:'步骤声明无效，请核对岗位、动作与依赖。',UPLOAD_CLOSED:'该上传已关闭，请新建上传任务。',UPLOAD_LIMIT:'未完成或待清理上传已达上限（公司20、本人5），请先完成或联系管理员清理。',SOURCE_MUST_BE_DISABLED:'请先停用离职员工账号，再办理交接。',TARGET_MUST_BE_ACTIVE:'接手员工必须处于启用状态。',HANDOVER_ROLE_MISMATCH:'接手人角色不匹配：客户及销售订单需业务员或管理员，运营任务需运营或管理员，供应商需管理员。',VERSION_CONFLICT:'资料已被更新，请刷新后重试。',IDEMPOTENCY_CONFLICT:'请求编号已用于不同内容，请重新打开表单。',NOT_FOUND:'未找到有权访问的记录。',INVALID_TRANSITION:'当前状态不能执行此操作。',QUANTITY_EXCEEDED:'数量超过可用额度。',AMOUNT_EXCEEDED:'金额超过未结余额。',DUPLICATE_REFERENCE:'该凭证编号已有有效记录。',CURRENCY_MISMATCH:'币种必须与关联单据一致。',REVIEW_REQUIRED:'请先完成资料复核。',DEPENDENCIES_EXIST:'存在后续业务记录，请先核对关联资料。',FILE_LIMIT:'文件大小、数量或类型超出限制。',FILE_NOT_READY:'文件尚未完成归档，请核对上传状态。',SIGNATURE_FORBIDDEN:'没有该签名或印章的使用授权。',STORAGE_NOT_CONFIGURED:'业务文件存储尚未配置。',EXPORT_LIMIT:'资料包超过100项、源文件合计50MiB或最终文件50MiB，请减少所选文件。',COMPANY_NOT_FOUND:'尚未配置本公司业务资料。',DECIMAL_PRECISION:'数值超出允许精度或范围。',DECIMAL_INVALID:'请填写有效的非负十进制数。'};
export function businessError(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(message==='AI_RECONCILIATION_REQUIRED')return Response.json({ok:false,code:message,message:'该订单已有待核对的AI请求，请管理员先核对原请求；不会自动重新调用。'},{status:409,headers:{'cache-control':'no-store'}});
 const financeLabels:Record<string,string>={EXPENSE_SELF_REVIEW:'不能审批本人申请，请由另一位管理员审批。',EXPENSE_RECEIPT_REQUIRED:'报销提交前请填写发票或原始凭证编号。',EXPENSE_APPLICATION_MISMATCH:'关联费用申请的申请人、订单、类别、币种或批准状态不匹配。',EXPENSE_APPLICATION_EXCEEDED:'关联申请的未使用额度不足，请先核对其他报销或另提费用申请。',AI_DISABLED:'AI大模型尚未启用，请联系管理员在设置中核对。未执行AI预审，规则检查仍可使用。',AI_TASK_DISABLED:'此项AI业务尚未启用，请管理员在AI大模型设置中开启对应业务。',AI_MODEL_REVIEW_REQUIRED:'所选模型尚未完成服务端核价配置，请维护人员核对模型与单价后再启用。',AI_KEY_STORAGE_NOT_CONFIGURED:'密钥加密服务尚未就绪，请联系维护人员。',AI_KEY_REQUIRED:'请填写API Key；更换服务商时需要填写该服务商的新Key。',AI_MODEL_UNAVAILABLE:'模型已停用、移除或缺少密钥，请在设置中检查。',AI_MODEL_REQUIRED:'请为启用的业务选择模型。',AI_MODEL_TEST_REQUIRED:'请先完成所选模型当前版本的真实连接测试。',AI_MODEL_LIMIT:'最多维护10条有效模型配置，请先移除不再使用的配置。',AI_CREDENTIAL_INVALID:'模型密钥无法解密，请管理员重新填写该模型API Key。',AI_NOT_CONFIGURED:'模型密钥、模型或费用限制尚未配置，请管理员在AI大模型设置中核对。',AI_PRICE_REVIEW_REQUIRED:'模型单价核对日期已过期或无效，请管理员重新核价确认。',AI_BUDGET_LIMIT:'AI分析达到费用或调用次数上限，请联系管理员核对。',AI_INPUT_LIMIT:'风险资料超出单次分析范围，请先核对规则风险。',AI_NO_RISKS:'该订单当前没有可供分析的规则风险。'};
 if(Object.hasOwn(financeLabels,message))return Response.json({ok:false,code:message,message:financeLabels[message]},{status:409,headers:{'cache-control':'no-store'}});
 if(message==='ROLE_ACTION_DENIED')return Response.json({ok:false,code:message,message:'当前岗位未获准执行此命令。'},{status:403,headers:{'cache-control':'no-store'}});
 if(message==='NO_IMPORTABLE_MAPS_ROWS')return Response.json({ok:false,code:message,message:'搜客结果中没有可导入的线索（缺少名称、邮箱或 placeId）。'},{status:409,headers:{'cache-control':'no-store'}});
 if(message.startsWith('LEADTOOL_')){
  const label=message==='LEADTOOL_TIMEOUT'?'地图搜客服务响应超时，请稍后重试；尚未导入任何线索。':message==='LEADTOOL_INVALID_RESPONSE'?'地图搜客服务返回格式无法识别，请检查服务状态后重试。':message==='LEADTOOL_CONFIG'?'LEADTOOL_BASE_URL 配置无效，请管理员核对服务地址。':'地图搜客服务暂时不可用，请稍后重试；尚未导入任何线索。';
  return Response.json({ok:false,code:message,message:label},{status:message==='LEADTOOL_TIMEOUT'?504:message==='LEADTOOL_CONFIG'?500:502,headers:{'cache-control':'no-store'}});
 }
 if(message==='BODY_TOO_LARGE')return Response.json({ok:false,code:message,message:'请求内容超过100000字节。'},{status:413,headers:{'cache-control':'no-store'}});
 if(message==='INVALID_INPUT')return Response.json({ok:false,code:message,message:'请提交有效的JSON资料。'},{status:400,headers:{'cache-control':'no-store'}});
 if(Object.hasOwn(labels,message))return Response.json({ok:false,code:message,message:labels[message]},{status:409,headers:{'cache-control':'no-store'}});
 if(error instanceof z.ZodError)return Response.json({ok:false,code:'INVALID_INPUT',message:'请检查必填字段、日期及数字格式。'},{status:400,headers:{'cache-control':'no-store'}});
 const code=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
 if(typeof code==='string'&&['CONNECTION_CLOSED','CONNECTION_ENDED','CONNECT_TIMEOUT','ETIMEDOUT','ECONNRESET','08000','08003','08006','57P01'].includes(code))return Response.json({ok:false,code:'RESULT_UNKNOWN',message:'提交结果尚未确认，请保留原请求重试核对。'},{status:503,headers:{'cache-control':'no-store'}});
 if(code==='42P01'||code==='42703')return Response.json({ok:false,code:'MIGRATION_REQUIRED',message:'完整业务数据库更新尚未应用。'},{status:503,headers:{'cache-control':'no-store'}});
 if(code==='23514'||code==='23505'||code==='23503')return Response.json({ok:false,code:'BUSINESS_CONSTRAINT',message:'资料状态、关联或编号发生冲突，请刷新核对。'},{status:409,headers:{'cache-control':'no-store'}});
 return accountError(error);
}
export async function actorFor(request?:Request){if(request&&request.method!=='GET')sameOrigin(request);const {employee,aal}=await requireEmployee();const actor={...employee,aal:typeof aal==='string'?aal:undefined};if(actor.role==='admin')checkAdmin(actor,actor.aal);return actor;}
export async function bodyOf<T>(request:Request,schema:z.ZodType<T>){
 const limit=100000;
 const declared=request.headers.get('content-length');
 if(declared&&/^\d+$/.test(declared)&&Number(declared)>limit)throw new Error('BODY_TOO_LARGE');
 const reader=request.body?.getReader();
 if(!reader)throw new Error('INVALID_INPUT');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel().catch(()=>{});throw new Error('BODY_TOO_LARGE');}chunks.push(part.value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let input:unknown;
 try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('INVALID_INPUT');}
 return schema.parse(input);
}
export const response=(data:unknown)=>Response.json({ok:true,data},{headers:{'cache-control':'no-store'}});
export function endpoint(handler:(request:Request,actor:BusinessActor)=>Promise<unknown>){return async(request:Request)=>{try{return response(await handler(request,await actorFor(request)));}catch(error){return businessError(error);}};}
