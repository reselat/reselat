import {it,expect} from 'vitest';
import {parseSetupTarget} from '../scripts/database-setup-target';
const base='postgres://postgres.qgbsikqgunmsipegkvda:TEST_ONLY@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres';
it('rejects query parameters that can override connection user or route to another project',()=>{for(const suffix of ['?user=postgres.other-project','?database=other','?options=test','?sslmode=disable','#fragment'])expect(()=>parseSetupTarget(base+suffix)).toThrow();});
it('accepts only the intended project administrator on the expected database and session port',()=>{expect(parseSetupTarget(base).username).toBe('postgres.qgbsikqgunmsipegkvda');expect(()=>parseSetupTarget(base.replace('qgbsikqgunmsipegkvda','other-project'))).toThrow();expect(()=>parseSetupTarget(base.replace('/postgres','/other'))).toThrow();expect(()=>parseSetupTarget(base.replace(':5432',':6543'))).toThrow();});
