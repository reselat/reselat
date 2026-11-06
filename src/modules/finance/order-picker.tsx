'use client';
import {useDeferredValue,useState} from 'react';
import {orderListDTO} from '@/modules/business/dto';
import {useResource} from '@/modules/business/ui/client';
import {Pagination,ResourceState} from '@/modules/business/ui/shared';
export function FinanceOrderPicker({value,onChange,optional=false}:{value:string;onChange:(id:string)=>void;optional?:boolean}){
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),query=useDeferredValue(search),resource=useResource({view:'orders',search:query,offset:String(offset)},orderListDTO);
 return <div><label>搜索关联订单<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} placeholder="输入订单编号"/></label><ResourceState {...resource}/><label>关联销售订单<select value={value} onChange={e=>onChange(e.target.value)} required={!optional}><option value="">{optional?'不关联订单（公共费用）':'请选择订单'}</option>{value&&!resource.data?.items.some(i=>i.id===value)&&<option value={value}>已选订单 {value.slice(0,8)}</option>}{resource.data?.items.map(row=><option key={row.id} value={row.id}>{row.no} · {row.currency}</option>)}</select></label><Pagination offset={offset} more={resource.data?.hasMore??false} onChange={setOffset}/></div>;
}
