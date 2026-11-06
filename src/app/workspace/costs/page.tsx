import {OrderCosts} from '@/modules/finance/order-costs';
export default async function Page({searchParams}:{searchParams:Promise<{order?:string}>}){const params=await searchParams;return <OrderCosts initialOrderId={params.order}/>;}
