import {outreachSendBrevo} from '@/server/business/outreach-send';
import {scanDueFollowups,followupRedraftSummary} from '@/server/business/followup-redraft';
import {outreachAuditCommand,outreachAuditList} from '@/server/business/outreach-audits';
import {diligenceAuditCommand,diligenceAuditList,humanDiligenceDecision} from '@/server/business/diligence-audits';
import {agentRoles,roleUpsert,assertAgentWrite} from '@/server/business/agent-roles';
import {runGet} from '@/server/business/agent-reads';
import {orchestrationCommand,confirmPlan} from '@/server/business/orchestration';
import {outreachWriteback} from '@/server/business/outreach-writeback';
import {prospectList,prospectCommand,approvalList,humanApprovalCommand} from '@/server/business/prospecting';
import {mapsSearchCommand,mapsImportCommand} from '@/server/business/maps';
import {agentList,aiUsageLedger} from '@/server/business/agent-reads';
import {getCustomer} from '@/server/business/records';
import {listModelProfiles,saveModel,archiveModel} from '@/server/ai/profiles';
import {testModelConnection} from '@/server/ai/connection-test';
import {getAiSettings,saveAiSettings,aiAvailability} from '@/server/ai/settings';
import {precheckRefundExport,listRefundExports} from '@/server/refunds/precheck';
import {customerDevelopment} from '@/server/business/development';
import {createExpense,transitionExpense,listExpenses} from '@/server/finance/expenses';
import {saveCostPlan,getOrderCosts,riskFeed,acknowledgeRisk} from '@/server/finance/order-costs';
import {analyseOrderRisk,reconcileRiskAi} from '@/server/finance/risk-ai';
import {previewEmployeeHandover,handoverEmployee} from '@/server/business/handover';
import {z} from 'zod';
import {attachOrigin,detachOrigin,listRecordOrigins,listOrderOrigins} from '@/server/files/origins';
import {actorFor,bodyOf,businessError,response} from '@/server/business/http';
import {uuid} from '@/modules/business/schemas';
import {checkAdmin} from '@/server/auth/employee';
import {listMembers} from '@/server/admin/members';
import {listRecords,saveRecord,getCompany,saveCompany,customerStageSuggestion} from '@/server/business/records';
import {createOrder,transitionOrder,listOrders,getOrderDetail} from '@/server/business/orders';
import {addFollowup,listFollowups,setCustomerAccess,previewTransfer,transferCustomer} from '@/server/business/customers';
import {createPurchases,transitionPurchase,recordReceipt} from '@/server/business/purchases';
import {createShipment,transitionShipment} from '@/server/business/shipments';
import {submitPayment,transitionPayment} from '@/server/business/payments';
import {dashboard,collectionRows,businessAudit} from '@/server/business/overview';
import {setOrderSupplier,orderSuppliers} from '@/server/business/suppliers';
import {reviseCustoms} from '@/server/business/customs';
import {createUploadIntent,createInternalUploadIntent,listFiles,reconcileFile} from '@/server/files/files';
import {finishUpload} from '@/server/files/chunks';
import {registerSignature,grantSignature,setSignatureEnabled,prepareSignatureUsage,listSignatures} from '@/server/documents/signatures';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){try{const actor=await actorFor(request),params=new URL(request.url).searchParams,view=params.get('view'),id=()=>uuid.parse(params.get('id'));
 if(request.headers.has('x-agent-company-id')&&request.headers.get('x-agent-company-id')!==actor.companyId)return Response.json({ok:false,code:'FORBIDDEN'},{status:403});
 switch(view){
 case 'followup-redrafts':return response(await followupRedraftSummary(actor));
 case 'outreach-audits':return response(await outreachAuditList(actor));
 case 'diligence-audits':return response(await diligenceAuditList(actor));
 case 'leads':case 'diligence':case 'drafts':return response(await prospectList(actor,view));
 case 'agent-roles':return response(await agentRoles(actor));
 case 'approval-queue':return response(await approvalList(actor,params.get('state')??undefined));
  case 'customer':return response(await getCustomer(actor,id()));
  case 'ai-usage-ledger':return response(await aiUsageLedger(actor,params.get('day')??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date())));
  case 'agent-run':return response(await runGet(actor,new URL(request.url).searchParams.get('id')??''));
  case 'agent-plans':case 'agent-pipelines':case 'agent-runs':return response(await agentList(actor,view));
  case 'ai-models':return response(await listModelProfiles(actor));
  case 'ai-settings':return response(await getAiSettings(actor));
  case 'ai-availability':return response(await aiAvailability(actor,z.enum(['order_risk','refund_precheck']).parse(params.get('task'))));
  case 'customer-stage-suggestion':return response(await customerStageSuggestion(actor,id()));
  case 'expenses':return response(await listExpenses(actor,params));
  case 'cost-report':return response(await getOrderCosts(actor,id()));
  case 'risk-feed':return response(await riskFeed(actor,params));
  case 'customer-development':return response(await customerDevelopment(actor,params.get('day')??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date())));
  case 'handover-preview':return response(await previewEmployeeHandover(actor,{sourceId:params.get('source'),targetId:params.get('target')}));
  case 'dashboard':return response(await dashboard(actor,params.get('today')??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date())));
  case 'records':return response(await listRecords(actor,params));
  case 'company':return response(await getCompany(actor));
  case 'orders':return response(await listOrders(actor,params));
  case 'order':return response(await getOrderDetail(actor,id()));
  case 'purchases':case 'shipments':case 'payments':case 'documents':case 'refunds':return response(await collectionRows(actor,view,params));
  case 'followups':return response(await listFollowups(actor,id()));
  case 'transfer-preview':return response(await previewTransfer(actor,id(),uuid.parse(params.get('target'))));
  case 'members':{checkAdmin(actor,actor.aal);const members=await listMembers(actor,new URLSearchParams({status:'active'}));return response(members.employees.filter(m=>m.enabled).map(m=>({id:m.id,name:m.name,role:m.role})));}
  case 'order-suppliers':return response(await orderSuppliers(actor,id()));
  case 'order-documents':{const {listDocuments}=await import('@/server/documents/documents');return response(await listDocuments(actor,id()));}
  case 'files':return response(await listFiles(actor,id()));
  case 'record-origins':return response(await listRecordOrigins(actor,z.enum(['product','supplier']).parse(params.get('kind')),id()));
  case 'order-origins':return response(await listOrderOrigins(actor,id()));
  case 'signatures':return response(await listSignatures(actor));
  case 'refund-exports':return response(await listRefundExports(actor,id(),z.coerce.number().int().min(0).max(100000).parse(params.get('offset')??0)));
  case 'refund-report':{const {getRefundReadiness}=await import('@/server/refunds/refunds');return response(await getRefundReadiness(actor,id()));}
  case 'audit':return response(await businessAudit(actor,params.get('id')?id():undefined));
  default:return Response.json({ok:false,code:'INVALID_INPUT',message:'请选择有效业务模块。'},{status:400,headers:{'cache-control':'no-store'}});
 }
 }catch(error){return businessError(error);}}
const command=z.object({action:z.string().min(1).max(60),input:z.unknown()}).strict();
export async function POST(request:Request){try{const actor=await actorFor(request),body=await bodyOf(request,command);let result;
 if(request.headers.has('x-agent-company-id')&&request.headers.get('x-agent-company-id')!==actor.companyId)return Response.json({ok:false,code:'FORBIDDEN'},{status:403});
 const isAgent=request.headers.has('x-agent-company-id');
 const roleCode=request.headers.get('x-agent-role-code')??undefined;
 if(isAgent){
 const businessActions=['leads_upsert','diligence_save_report','outreach_draft_email','outreach_submit_approval'];
 const hostActions=['outreach_followup_scan','outreach_audit_submit','outreach_audit_record','outreach_audit_fuse','diligence_audit_submit','diligence_audit_record','diligence_audit_fuse','run_claim','pipeline_advance','run_cancel','run_requeue'];
 if(body.action==='maps_search'||body.action==='maps_import')await assertAgentWrite(actor,roleCode,'leads_upsert');
 else if(businessActions.includes(body.action))await assertAgentWrite(actor,roleCode,body.action);
 else if(!hostActions.includes(body.action))throw Error('INVALID_INPUT');
 }
 switch(body.action){
 case 'outreach_send_brevo':if(isAgent)throw Error('INVALID_INPUT');result=await outreachSendBrevo(actor,body.input);break;
 case 'outreach_followup_scan':result=await scanDueFollowups(actor,body.input);break;
 case 'outreach_audit_submit':case 'outreach_audit_record':case 'outreach_audit_fuse':result=await outreachAuditCommand(actor,body.action,body.input);break;
 case 'diligence_audit_submit':case 'diligence_audit_record':case 'diligence_audit_fuse':result=await diligenceAuditCommand(actor,body.action,body.input);break;
 case 'diligence_audit_decide':if(isAgent)throw Error('INVALID_INPUT');result=await humanDiligenceDecision(actor,body.input);break;
 case 'role_upsert':result=await roleUpsert(actor,body.input);break;
  case 'plan_confirm':if(request.headers.has('x-agent-company-id'))throw Error('INVALID_INPUT');result=await confirmPlan(actor,body.input);break;
  case 'outreach_writeback':result=await outreachWriteback(actor,body.input);break;
  case 'outreach_approve':case 'outreach_reject':if(request.headers.has('x-agent-company-id'))throw Error('INVALID_INPUT');result=await humanApprovalCommand(actor,body.action,body.input);break;
  case 'ai.model.save':result=await saveModel(actor,body.input);break;
  case 'ai.model.archive':result=await archiveModel(actor,body.input);break;
  case 'ai.model.test':result=await testModelConnection(actor,body.input);break;
  case 'ai.settings.save':result=await saveAiSettings(actor,body.input);break;
  case 'expense.create':result=await createExpense(actor,body.input);break;
  case 'expense.action':result=await transitionExpense(actor,body.input);break;
  case 'cost.plan':result=await saveCostPlan(actor,body.input);break;
  case 'plan_upsert':case 'pipeline_upsert':case 'run_enqueue':case 'run_claim':case 'pipeline_advance':case 'run_cancel':case 'run_resume':case 'run_requeue':result=await orchestrationCommand(actor,body.action,body.input);break;
  case 'leads_upsert':case 'diligence_save_report':case 'outreach_draft_email':case 'outreach_submit_approval':result=await prospectCommand(actor,body.action,body.input,isAgent?roleCode:undefined);break;
  case 'maps_search':result=await mapsSearchCommand(actor,body.input);break;
  case 'maps_import':result=await mapsImportCommand(actor,body.input,isAgent?roleCode:undefined);break;
  case 'risk.read':result=await acknowledgeRisk(actor,body.input);break;
  case 'risk.ai':result=await analyseOrderRisk(actor,body.input);break;
  case 'risk.ai.reconcile':result=await reconcileRiskAi(actor,body.input);break;
  case 'employee.handover':result=await handoverEmployee(actor,body.input);break;
  case 'record.save':result=await saveRecord(actor,body.input);break;
  case 'company.save':result=await saveCompany(actor,z.object({requestId:uuid,payload:z.unknown()}).strict().parse(body.input));break;
  case 'followup.add':result=await addFollowup(actor,body.input);break;
  case 'customer.share':result=await setCustomerAccess(actor,body.input);break;
  case 'customer.transfer':result=await transferCustomer(actor,body.input);break;
  case 'order.save':result=await createOrder(actor,body.input);break;
  case 'order.action':result=await transitionOrder(actor,body.input);break;
  case 'order.supplier':result=await setOrderSupplier(actor,body.input);break;
  case 'order.customs':result=await reviseCustoms(actor,body.input);break;
  case 'purchase.create':result=await createPurchases(actor,body.input);break;
  case 'purchase.action':result=await transitionPurchase(actor,body.input);break;
  case 'receipt.add':result=await recordReceipt(actor,body.input);break;
  case 'shipment.create':result=await createShipment(actor,body.input);break;
  case 'shipment.action':result=await transitionShipment(actor,body.input);break;
  case 'payment.submit':result=await submitPayment(actor,body.input);break;
  case 'payment.action':result=await transitionPayment(actor,body.input);break;
  case 'document.draft':{const {createDocumentDraft}=await import('@/server/documents/documents');result=await createDocumentDraft(actor,body.input);break;}
  case 'document.confirm':{const {confirmDocument}=await import('@/server/documents/documents');result=await confirmDocument(actor,body.input);break;}
  case 'document.generate':{const {generateDocument}=await import('@/server/documents/documents');result=await generateDocument(actor,z.object({id:uuid,requestId:uuid.optional()}).strict().parse(body.input).id);break;}
  case 'document.void':{const {voidDocument}=await import('@/server/documents/documents');result=await voidDocument(actor,body.input);break;}
  case 'origin.attach':result=await attachOrigin(actor,body.input);break;
  case 'origin.detach':result=await detachOrigin(actor,body.input);break;
  case 'origin.intent':case 'file.intent':result=await createUploadIntent(actor,body.input);break;
  case 'signature.intent':checkAdmin(actor,actor.aal);result=await createInternalUploadIntent(actor,z.object({requestId:uuid,orderId:z.null(),category:z.literal('signature'),name:z.string(),mime:z.enum(['image/png','image/jpeg']),size:z.number().int().positive().max(2097152),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(body.input));break;
  case 'file.finish':result=await finishUpload(actor,z.object({id:uuid,requestId:uuid.optional()}).strict().parse(body.input).id);break;
  case 'file.reconcile':result=await reconcileFile(actor,z.object({id:uuid,requestId:uuid.optional()}).strict().parse(body.input).id);break;
  case 'signature.register':result=await registerSignature(actor,body.input);break;
  case 'signature.grant':result=await grantSignature(actor,body.input);break;
  case 'signature.enable':result=await setSignatureEnabled(actor,body.input);break;
  case 'signature.prepare':result=await prepareSignatureUsage(actor,body.input);break;
  case 'refund.precheck':result=await precheckRefundExport(actor,body.input);break;
  case 'refund.review':{const {reviewRefundItem}=await import('@/server/refunds/refunds');result=await reviewRefundItem(actor,body.input);break;}
  case 'refund.export':{const {exportRefundPack}=await import('@/server/refunds/refunds');result=await exportRefundPack(actor,body.input);break;}
  default:throw new Error('INVALID_INPUT');
 }
 return response(result);
 }catch(error){return businessError(error);}}
