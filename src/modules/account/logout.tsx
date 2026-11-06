'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
export function Logout(){const router=useRouter();const [error,setError]=useState('');return <><button className="button" onClick={async()=>{const response=await fetch('/api/account/logout',{method:'POST'});if(response.ok){router.replace('/login');router.refresh();}else setError('退出未完成，请重试。');}}>退出登录</button>{error&&<p role="alert">{error}</p>}</>;}
