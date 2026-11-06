import { Refunds } from '@/modules/workspace/refunds';
export default async function Page({searchParams}:{searchParams:Promise<{order?:string}>}){const {order}=await searchParams;return <Refunds initialOrderId={order}/>;}
