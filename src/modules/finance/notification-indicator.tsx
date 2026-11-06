'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {readData} from '@/modules/business/ui/client';
import {riskFeedDTO} from './dto';
export function RiskIndicator(){const [state,setState]=useState<'unknown'|'unread'|'read'>('unknown');useEffect(()=>{const controller=new AbortController();async function load(){if(document.visibilityState==='hidden')return;try{const data=await readData({view:'risk-feed'},riskFeedDTO,controller.signal);if(!controller.signal.aborted)setState(data.items.some(i=>!i.read)?'unread':'read');}catch{if(!controller.signal.aborted)setState('unknown');}}void load();const timer=setInterval(load,90000);return()=>{controller.abort();clearInterval(timer);};},[]);return <Link href="/workspace/risks" aria-label={state==='unread'?'风险中心，有未读提醒':'风险中心'}>{state==='unread'?'● 有风险提醒':'风险中心'}</Link>;}
