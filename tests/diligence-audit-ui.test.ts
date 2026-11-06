import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('offers human exception handling in the workbench and excludes decisions from Host actions',()=>{
 const ui=readFileSync('src/modules/business/ui/prospecting.tsx','utf8');
 expect(ui).toContain('diligence-audits');
 expect(ui).toContain('diligence_audit_decide');
 expect(ui).toContain('高置信已自动落库');
 const route=readFileSync('src/app/api/workspace/business/route.ts','utf8');
 expect(route).toContain("case 'diligence_audit_decide':if(isAgent)throw Error('INVALID_INPUT')");
 const schemas=readFileSync('scripts/agents/p1-schemas.mjs','utf8');
 expect(schemas).not.toContain('diligence_audit_decide');
});
