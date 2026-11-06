import { workspaceSchema,type Workspace } from './model';
export function decodeWorkspace(raw:string):Workspace{if(raw.length>5000000)throw new Error('本机数据过大，请先备份');return workspaceSchema.parse(JSON.parse(raw));}
