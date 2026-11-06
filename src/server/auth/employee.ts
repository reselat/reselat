import {z} from 'zod';
export const employeeSchema=z.object({id:z.string().uuid(),companyId:z.string().uuid(),role:z.enum(['admin','sales','operations']),enabled:z.boolean(),archivedAt:z.string().nullable().optional(),version:z.number().int().positive()});
export type Employee={id:string;companyId:string;role:'admin'|'sales'|'operations';enabled:boolean;archivedAt?:string|null;version:number};
export class IdentityError extends Error{constructor(public code:'UNAUTHENTICATED'|'FORBIDDEN'|'MFA_REQUIRED'|'NOT_CONFIGURED'){super(code);}}
export function checkEmployee(employee:Employee|null,userId:string,companyId:string):Employee{if(!employee||!employee.enabled||employee.archivedAt||employee.id!==userId||employee.companyId!==companyId)throw new IdentityError('FORBIDDEN');return employee;}
export function checkAdmin(employee:Employee,aal:string|undefined){if(!employee.enabled||employee.archivedAt||employee.role!=='admin')throw new IdentityError('FORBIDDEN');}
const change=z.object({role:z.enum(['admin','sales','operations']),enabled:z.boolean(),archivedAt:z.string().nullable().optional(),version:z.number().int().positive()}).strict();
export const parseRoleChange=(input:unknown)=>change.parse(input);
