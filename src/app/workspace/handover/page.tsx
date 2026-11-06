import {pageEmployee} from '@/server/auth/session';
import {EmployeeHandover} from '@/modules/business/ui/handover';
export default async function Page(){await pageEmployee(true);return <EmployeeHandover/>;}
