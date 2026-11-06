import {X509Certificate} from 'node:crypto';
export function databaseTls(ca?:string):{rejectUnauthorized:true;ca?:string}{
 if(!ca)return {rejectUnauthorized:true};
 try{const pattern=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;const certificates=ca.match(pattern);if(!certificates?.length||ca.replace(pattern,'').trim()||certificates.some(value=>!new X509Certificate(value).ca))throw new Error('TLS_CA_INVALID');}catch{throw new Error('TLS_CA_INVALID');}
 return {rejectUnauthorized:true,ca};
}
