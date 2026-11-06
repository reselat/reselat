import {notFound} from 'next/navigation';
import {localTestEnabled} from '@/server/local-test/guard';
import {pageEmployee} from '@/server/auth/session';
import {AgentRuns} from '@/modules/business/ui/agent-runs';
export default async function Page(){if(!localTestEnabled())notFound();await pageEmployee(true);return <AgentRuns/>;}
