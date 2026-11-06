import {localDemoGuard} from '@/server/auth/local-demo';
import { renderTradeDocument,validateTradeDocument } from '@/templates/trade';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
 const denied=localDemoGuard(request);if(denied)return denied;
 try{const text=await request.text();if(text.length>100000)return Response.json({code:'PAYLOAD_TOO_LARGE'},{status:413,headers});const data=validateTradeDocument(JSON.parse(text));const pdf=await renderTradeDocument(data);const filename=(data.type+'-'+data.number).replace(/[^a-zA-Z0-9_-]/g,'_');return new Response(new Uint8Array(pdf),{headers:{...headers,'content-type':'application/pdf','content-disposition':`attachment; filename="${filename}.pdf"`}});}catch{return Response.json({code:'DOCUMENT_VALIDATION_OR_RENDER_FAILED',message:'请检查地址、金额与装箱信息是否完整一致。'},{status:400,headers});}
}
