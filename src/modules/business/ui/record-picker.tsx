 'use client';
import {useDeferredValue,useId,useState} from 'react';
import {recordListDTO} from '../dto';
import {useResource,text} from './client';
export function RecordPicker({kind,name,value,onChange,onSelect,required=false,label,inline=false}:{kind:'customer'|'product'|'supplier';name?:string;value:string;onChange:(id:string)=>void;onSelect?:(payload:Record<string,unknown>)=>void;required?:boolean;label:string;inline?:boolean}){
 const id=useId(),[search,setSearch]=useState(''),deferred=useDeferredValue(search),resource=useResource({view:'records',kind,search:deferred},recordListDTO);
 return <div className={'record-picker'+(inline?' record-picker-inline':'')}><label htmlFor={id}>{label}</label><input aria-label={'搜索'+label} placeholder={'输入关键词搜索'+label} value={search} onChange={event=>setSearch(event.target.value)}/><select id={id} aria-label={label} name={name} value={value} onChange={event=>{onChange(event.target.value);const row=resource.data?.items.find(item=>item.id===event.target.value);if(row)onSelect?.(row.payload);}} required={required}><option value="">请选择</option>{value&&!resource.data?.items.some(item=>item.id===value)&&<option value={value}>已选择的关联资料</option>}{resource.data?.items.map(row=><option key={row.id} value={row.id}>{text(row.payload.name)||text(row.payload.nameEn)}{row.payload.sku?' · '+text(row.payload.sku):''}</option>)}</select>{resource.error&&<small className="record-picker-message" role="alert">{resource.error}</small>}<small className="shared-note record-picker-message">最多显示50条匹配资料，可继续输入关键词缩小范围。</small></div>;
}
