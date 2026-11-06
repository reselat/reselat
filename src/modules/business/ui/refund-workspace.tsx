'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Heading,Panel,useActor} from './shared';
import {RefundTab} from './order-documents';
import {FinanceOrderPicker} from '@/modules/finance/order-picker';
export function RefundWorkspace(){const params=useSearchParams(),[orderId,setOrderId]=useState(params.get('order')??''),actor=useActor();return <><Heading title="退税资料与AI预审" description="选择订单，在本页整理资料、生成资料包并执行AI清单预审。"/><Panel title="选择退税订单"><FinanceOrderPicker value={orderId} onChange={setOrderId}/><ol className="shared-note"><li>选择订单，补充资料并完成人工核对。</li><li>导出CSV、PDF或ZIP，建立该版本的资料包。</li><li>在“AI退税预审”中点击“AI预审本版本”，查看需补充事项及状态标签。</li></ol>{actor.role==='sales'&&<p className="shared-note">业务员可查看权限范围内的资料。资料包导出和AI预审由管理员或订单运营负责人办理。</p>}</Panel>{orderId?<><p><Link href={'/workspace/orders/'+orderId+'?tab=refunds'}>查看关联订单</Link></p><RefundTab key={orderId} orderId={orderId}/></>:<Panel title="AI退税预审"><p>请先选择订单。选定后，资料整理、导出和AI预审操作会显示在本页。</p></Panel>}</>;}
