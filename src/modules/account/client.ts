'use client';
import {createBrowserClient} from '@supabase/ssr';
export function browserAuth(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('登录服务尚未配置');return createBrowserClient(url,key);}
