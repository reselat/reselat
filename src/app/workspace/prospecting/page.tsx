import {pageEmployee} from '@/server/auth/session';
import {Prospecting} from '@/modules/business/ui/prospecting';
export default async function Page(){await pageEmployee(true);return <Prospecting/>;}
