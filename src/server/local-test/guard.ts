export const localCompanyId='10000000-0000-4000-8000-000000000001';
export const localActors={admin:'10000000-0000-4000-8000-000000000002',sales:'10000000-0000-4000-8000-000000000003',operations:'10000000-0000-4000-8000-000000000004'} as const;
export function localTestEnabled(env:NodeJS.ProcessEnv=process.env){return env.RESELAT_LOCAL_TEST==='1'&&env.NODE_ENV==='development'&&!env.VERCEL;}
export function localTestAuthority(host:string|null,origin:string|null=null){try{if(!host)return false;const u=new URL('http://'+host);if(u.host!==host||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password)return false;return !origin||new URL(origin).origin===u.origin;}catch{return false;}}
