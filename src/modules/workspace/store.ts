'use client';
import { useSyncExternalStore } from 'react';
import { initialWorkspace } from './seed';
import { decodeWorkspace } from './storage-codec';
import { workspaceSchema,type Workspace } from './model';
const KEY='trade-workstation-local-v2',EVENT='trade-workstation-change';
const initial=initialWorkspace();let cached=initial;let lastRaw:string|null|undefined;let problem='';
function read(){
 if(typeof window==='undefined')return initial;
 try{const raw=localStorage.getItem(KEY);if(raw!==lastRaw){cached=raw?decodeWorkspace(raw):initial;lastRaw=raw;problem='';}}
 catch{problem='无法读取本机资料：数据损坏、版本不兼容或浏览器禁止存储。已停止写入，请先备份并检查。';}
 return cached;
}
function subscribe(listener:()=>void){window.addEventListener('storage',listener);window.addEventListener(EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(EVENT,listener);};}
export function useWorkspace(){
 const state=useSyncExternalStore(subscribe,read,()=>initial);
 const ready=useSyncExternalStore(subscribe,()=>true,()=>false);
 function update(fn:(s:Workspace)=>Workspace){const current=read();if(problem)throw new Error(problem);if(current.revision!==state.revision)throw new Error('资料已被其他页面更新，请检查后重新提交');const next=workspaceSchema.parse(fn(current));
  const raw=JSON.stringify(next);if(raw.length>5000000)throw new Error('本机资料超过容量限制，请先备份');localStorage.setItem(KEY,raw);cached=next;lastRaw=raw;window.dispatchEvent(new Event(EVENT));
 }
 return {state,ready,problem,update};
}
