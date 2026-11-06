import { WorkspaceOrderDetail } from '@/modules/workspace/order-detail';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <WorkspaceOrderDetail id={id}/>;}
