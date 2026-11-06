import {it,expect} from 'vitest';
import {auditSummary} from '../src/server/admin/audit-summary';
it('shows a fixed action summary without exposing original details',()=>{
 expect(auditSummary('employee.update',{password:'PRIVATE',role:'admin'})).toBe('更新成员角色或状态');
 expect(auditSummary('PRIVATE_UNKNOWN',{password:'PRIVATE'})).toBe('成员管理操作');
});
