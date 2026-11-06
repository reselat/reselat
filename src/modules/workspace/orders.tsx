'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from './store';
import { getBalance } from './operations';
import { LocalNotice,Money,FormError } from './ui';
const labels={unpaid:'未收款',partial:'部分收款',paid:'已收齐'};
export function OrderList(){const {state,ready,problem}=useWorkspace();const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');if(!ready)return <p>读取订单…</p>;
 const rows=state.orders.filter(o=>[o.no,o.customer.name].some(t=>t.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||getBalance(state,'sale',o.id).status===filter));
 return <><div className="page-heading"><div><h1>销售订单</h1><p>新建订单、生成单据，并跟踪每一笔应收款。</p></div><Link className="button primary" href="/demo/orders/new">＋ 新建订单</Link></div><LocalNotice/><FormError message={problem}/><section className="panel"><div className="toolbar"><input aria-label="搜索订单" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索订单号或客户"/><select aria-label="收款状态" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部收款状态</option>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="table-scroll"><table><thead><tr><th>订单 / 客户</th><th>交期</th><th>订单金额</th><th>已收</th><th>未收</th><th>收款状态</th><th/></tr></thead><tbody>{rows.map(o=>{const b=getBalance(state,'sale',o.id);return <tr key={o.id}><td><Link className="strong-link" href={'/demo/orders/'+o.id}>{o.no}</Link><small>{o.customer.name}</small></td><td>{o.deliveryDate}</td><td><Money value={o.totalMinor} currency={o.currency}/></td><td><Money value={b.paid} currency={o.currency}/></td><td><Money value={b.remaining} currency={o.currency}/></td><td><span className={'status '+(b.status==='paid'?'green':'amber')}>{labels[b.status as keyof typeof labels]}</span></td><td><Link href={'/demo/orders/'+o.id}>打开订单</Link></td></tr>;})}</tbody></table>{!rows.length&&<div className="empty-state">尚无匹配订单。<Link href="/demo/orders/new">新建第一笔订单</Link></div>}</div></section></>;
}
