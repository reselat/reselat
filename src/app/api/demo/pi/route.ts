import {localDemoGuard} from '@/server/auth/local-demo';
import { buildPiSnapshot } from '@/templates/pi-data';
import { renderPi } from '@/templates/pi';
import { orders } from '@/modules/demo/data';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const denied=localDemoGuard(request);if(denied)return denied;
 const id=new URL(request.url).searchParams.get('order');
 const order=orders.find(item=>item.id===id);
 if(!order)return Response.json({code:'DEMO_ORDER_NOT_FOUND'},{status:404,headers:{'cache-control':'no-store'}});
 const snapshot=buildPiSnapshot({id:order.id,customer:order.customer,quantity:String(order.quantity),price:order.price});
 try{
  const bytes=await renderPi(snapshot);
  return new Response(new Uint8Array(bytes),{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="DEMO-PI-${order.id}.pdf"`,'cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return Response.json({code:'DEMO_PDF_FAILED'},{status:500,headers:{'cache-control':'no-store'}});}
}
