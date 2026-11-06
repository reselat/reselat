import {pageEmployee} from '@/server/auth/session';
import {UploadMaintenance} from '@/modules/account/upload-maintenance';
export default async function Page(){await pageEmployee(true);return <UploadMaintenance/>;}
