const labels:Record<string,string>={'employee.create':'创建成员账号','employee.update':'更新成员角色或状态','employee.archive':'移除并归档成员','employee.restore':'恢复归档成员','bootstrap.admin':'设置初始管理员'};
export function auditSummary(action:string,_details?:unknown){void _details;return Object.hasOwn(labels,action)?labels[action]:'成员管理操作';}
