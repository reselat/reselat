export const project='qgbsikqgunmsipegkvda';
export const company='0bb12fc8-66cd-48fe-9f75-bbb65dbdf494';
export function parseSetupTarget(raw:string):URL{
 let url:URL;try{url=new URL(raw.trim());}catch{throw new Error('INVALID_CONNECTION_STRING');}
 if(url.search||url.hash)throw new Error('CONNECTION_PARAMETERS_NOT_ALLOWED');
 if(url.pathname!=='/postgres')throw new Error('CONNECTION_DATABASE_MISMATCH');
 if(url.port&&url.port!=='5432')throw new Error('CONNECTION_PORT_MISMATCH');
 let username:string;try{username=decodeURIComponent(url.username);}catch{throw new Error('INVALID_CONNECTION_STRING');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!(url.hostname==='db.'+project+'.supabase.co'||(url.hostname.endsWith('.pooler.supabase.com')&&username==='postgres.'+project))||!(username==='postgres'||username==='postgres.'+project))throw new Error('WRONG_PROJECT_OR_USER');
 if(!url.password)throw new Error('PASSWORD_MISSING');
 return url;
}
export function withDatabasePassword(raw:string,password:string):URL{if(!password)throw new Error('PASSWORD_MISSING');const url=parseSetupTarget(raw);url.password=encodeURIComponent(password);return url;}
