const project='qgbsikqgunmsipegkvda';
export function validateAuthAdminKey(input:string){
 const key=input.trim();
 if(/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key))return key;
 try{const parts=key.split('.');if(parts.length===3){const claims:unknown=JSON.parse(Buffer.from(parts[1],'base64url').toString());if(typeof claims==='object'&&claims!==null&&'role' in claims&&claims.role==='service_role'&&'ref' in claims&&claims.ref===project)return key;}}catch{}
 throw new Error('INVALID_ADMIN_KEY');
}
export function replaceAdminKey(text:string,key:string){const line='SUPABASE_AUTH_ADMIN_KEY='+JSON.stringify(validateAuthAdminKey(key));const pattern=/^SUPABASE_AUTH_ADMIN_KEY=.*$/m;return pattern.test(text)?text.replace(pattern,()=>line):text.trimEnd()+'\n'+line+'\n';}
