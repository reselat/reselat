export function localDemoGuard(request:Request):Response|undefined{
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
 if(process.env.NODE_ENV!=='development')return Response.json({code:'LOCAL_TRIAL_DISABLED_IN_PRODUCTION'},{status:403,headers});
 try{const authority=request.headers.get('host')??new URL(request.url).host;const parsed=new URL('http://'+authority);if(parsed.host!==authority||parsed.username||parsed.password||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error();const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==parsed.host)throw new Error();}catch{return Response.json({code:'LOCAL_TRIAL_ONLY'},{status:403,headers});}
}
