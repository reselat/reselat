// Deliberately accepts no URL and reads no environment or credential files.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const phase2=['20261104000000_agent_foundation.sql','20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261104012000_outreach_writeback.sql','20261104013000_agent_orchestration.sql','20261105090000_agent_plans.sql','20261105100000_agent_roles.sql','20261105120000_agent_step_deps.sql','20261105130000_diligence_audits.sql','20261105140000_outreach_audits.sql','20261105160000_followup_redraft.sql','20261105160000_outreach_send.sql','20261105170000_leads_maps.sql'];
export async function migrate(){
 const db=new PGlite();
 try {
 const source=await readFile('tests/helpers/full-business.ts','utf8');
 const baseline=[...source.matchAll(/'([^']+\.sql)'/g)].map(m=>m[1]);
 await db.exec('create role anon; create role authenticated;');
 for(const file of ['business-initial-schema.sql',...baseline,...phase2])await db.exec(await readFile('scripts/sql/'+file,'utf8'));
 for(const file of phase2){let failed=false;try{await db.exec(await readFile('scripts/sql/'+file,'utf8'));}catch{failed=true;await db.exec('rollback');}if(failed===(['20261104011000_human_approval.sql','20261105120000_agent_step_deps.sql','20261105130000_diligence_audits.sql','20261105140000_outreach_audits.sql','20261105160000_followup_redraft.sql'].includes(file)))throw Error('Unexpected replay success: '+file);}
 const tables=await db.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='trade_business' and relkind='r'");
 for(const {relname,relrowsecurity} of tables.rows){if(/^(agent_|leads$|diligence_(reports|audits)$|outreach_(drafts|audits)$|approval_queue$)/.test(relname)&&!relrowsecurity)throw Error('RLS missing '+relname);for(const role of ['anon','authenticated']){const r=await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",[role,'trade_business.'+relname]);if(r.rows[0].allowed)throw Error('Unexpected grants');}}
 const constraints=await db.query("select contype,count(*) from pg_constraint where connamespace='trade_business'::regnamespace group by contype");
 console.log(JSON.stringify({engine:'PGlite',migrations:phase2.length,replay:'human_approval, step_deps, diligence_audits/outreach_audits and followup_redraft replay; other migrations reject replay',tables:tables.rows.length,constraints:constraints.rows}));
 return db;
 }catch(e){await db.close();throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const db=await migrate();await db.close();}
