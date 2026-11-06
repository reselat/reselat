import {it,expect} from 'vitest';
import {openBusiness,admin} from './helpers/business-db';
import {businessMigrations} from './helpers/full-business';
import {upgradeLocalAgentRoles} from '@/server/local-test/agent-roles-migration';
it('upgrades an existing local database without replacing business data or role edits',async()=>{
 const db=await openBusiness(businessMigrations);
 try{
 await db.exec('reset role');
 await upgradeLocalAgentRoles(db);
 await db.query("insert into trade_business.agent_roles(company_id,id,code,display_name,system_prompt,allowed_actions) values($1,$2,'prospecting','Custom','Review only',array[]::text[])",[admin.companyId,crypto.randomUUID()]);
 await upgradeLocalAgentRoles(db);
 expect((await db.query('select display_name,allowed_actions from trade_business.agent_roles')).rows).toEqual([{display_name:'Custom',allowed_actions:[]}]);
 expect((await db.query('select id from trade_business.company_profiles')).rows).toEqual([{id:admin.companyId}]);
 }finally{await db.close();}
});
