import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('offers draft audit submission and shows auto gate with existing human queue',()=>{
 const ui=readFileSync('src/modules/business/ui/prospecting.tsx','utf8');
 for(const text of ['outreach-audits','outreach_audit_submit','outreach_audit_fuse','自动批准','已回写','outreach_approve','回写 ≠ 已发信'])expect(ui).toContain(text);
 const schemas=readFileSync('scripts/agents/p1-schemas.mjs','utf8');
 expect(schemas).not.toContain('outreach_approve');
});
it('registers outreach audit migrations for new and existing local test databases',()=>{
 const source=readFileSync('src/server/local-test/database.ts','utf8');
 expect(source.split('20261105140000_outreach_audits.sql')).toHaveLength(3);
});
