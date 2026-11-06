import type {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
// Existing local-test databases are persistent; migrate before switching to backend role.
export async function upgradeLocalAgentRoles(db:PGlite){
 const exists=await db.query<{name:string|null}>("select to_regclass('trade_business.agent_roles')::text as name");
 if(!exists.rows[0].name)await db.exec(await readFile('scripts/sql/20261105100000_agent_roles.sql','utf8'));
}
