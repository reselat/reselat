import {it,expect} from 'vitest';
import {rootCertificates} from 'node:tls';
import {databaseTls} from '../scripts/database-tls';
it('always validates the database certificate and hostname',()=>{expect(databaseTls()).toEqual({rejectUnauthorized:true});expect(databaseTls(rootCertificates[0])).toEqual({rejectUnauthorized:true,ca:rootCertificates[0]});});
it('rejects private keys and non-certificate content as CA configuration',()=>{expect(()=>databaseTls('not a certificate')).toThrow();expect(()=>databaseTls('-----BEGIN PRIVATE KEY-----\nTEST ONLY')).toThrow();});
it('loads the official pinned Supabase root CA with verification enabled',async()=>{const {readFile}=await import('node:fs/promises');const {X509Certificate}=await import('node:crypto');const ca=await readFile('assets/certificates/supabase-prod-ca-2021.crt','utf8');expect(new X509Certificate(ca).fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');expect(databaseTls(ca).rejectUnauthorized).toBe(true);});
