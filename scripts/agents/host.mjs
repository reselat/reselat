import {z} from 'zod';
export function createHost(companyId,read){z.uuid().parse(companyId);let heartbeatAt=null;return {heartbeat(){heartbeatAt=new Date().toISOString();return {companyId,heartbeatAt,state:'idle'};},async listPipelines(){if(!read)return [];return read(new URLSearchParams({view:"agent-pipelines"}));},async listRuns(){if(!read)return [];return read(new URLSearchParams({view:"agent-runs"}));}};}
// Orchestrator extension point: no claiming, execution or business writes in P0.
