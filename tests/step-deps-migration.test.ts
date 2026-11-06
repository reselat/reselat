import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {openBusiness,admin} from './helpers/business-db';
import {businessMigrations} from './helpers/full-business';
it('backfills existing run evidence and replays without changing declarations or company data',async()=>{
 const db=await openBusiness([...businessMigrations,'20261104000000_agent_foundation.sql','20261104013000_agent_orchestration.sql']);
 try{
 const pipeline=crypto.randomUUID(),run=crypto.randomUUID();
 await db.query("insert into trade_business.agent_pipelines(company_id,id,name) values($1,$2,'Existing')",[admin.companyId,pipeline]);
 await db.query('insert into trade_business.agent_runs(company_id,id,pipeline_id) values($1,$2,$3)',[admin.companyId,run,pipeline]);
 await db.query("insert into trade_business.agent_steps(company_id,run_id,seq,kind,state,evidence) values($1,$2,0,'leads_upsert','succeeded','{}')",[admin.companyId,run]);
 await db.exec('reset role');
 const sql=await readFile('scripts/sql/20261105120000_agent_step_deps.sql','utf8');await db.exec(sql);
 expect((await db.query('select step_key,role_code,evidence from trade_business.agent_steps')).rows).toEqual([{step_key:'prospect',role_code:'prospecting',evidence:{}}]);
 await db.query("update trade_business.agent_pipelines set steps_graph=jsonb_set(steps_graph,'{0,step_key}','\"custom\"')");
 const before=(await db.query('select * from trade_business.agent_pipelines')).rows;
 await db.exec(sql);
 expect((await db.query('select * from trade_business.agent_pipelines')).rows).toEqual(before);
 expect((await db.query('select id from trade_business.company_profiles')).rows).toEqual([{id:admin.companyId}]);
 }finally{await db.close();}
});
