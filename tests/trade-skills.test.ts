import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
// @ts-expect-error shared Node module
import {loadTradeSkills} from '../scripts/agents/skills.mjs';
// @ts-expect-error shared Node module
import {createTools} from '../scripts/agents/tools.mjs';
it('loads only role-whitelisted instruction documents and rejects arbitrary paths',()=>{
 const skills=loadTradeSkills('diligence');
 expect(skills.map((s:any)=>s.id)).toEqual(['diligence-checklist','approval-rules']);
 expect(skills[0].content).toContain('来源');
 for(const id of ['../README.md','/etc/passwd','unknown','compliant-outreach'])expect(()=>loadTradeSkills('diligence',[id])).toThrow('SKILL_DENIED');
 expect(()=>loadTradeSkills('unknown')).toThrow('SKILL_DENIED');
});
it('loads skill instructions into current tool descriptions without adding authority',async()=>{
 const api=createTools({companyId:'11111111-1111-4111-8111-111111111111',roleCode:'outreach_draft',read:async()=>({items:[]}),write:async()=>{throw Error('UNEXPECTED_WRITE');}});
 const tools=await api.listCurrent();
 expect(tools.find((t:any)=>t.name==='outreach_draft_email').description).toContain('compliant-outreach');
 for(const name of ['plan_confirm','run_claim','pipeline_advance','run_resume','outreach_approve','outreach_reject','outreach_send']){
 expect(tools.some((t:any)=>t.name===name)).toBe(false);
 await expect(api.call(name,{})).rejects.toThrow('UNKNOWN_TOOL');
 }
});

it.each([
 ['prospecting',['lead-qualification','followup-cadence'],['quote-boundaries']],
 ['outreach_draft',['quote-boundaries','followup-cadence'],['lead-qualification']],
 ['diligence',[],['lead-qualification','quote-boundaries','followup-cadence']],
])('loads new instructions only for assigned role %s',(role,allowed,denied)=>{
 for(const id of allowed){
  const [skill]=loadTradeSkills(role,[id]);
  expect(skill.id).toBe(id);
  expect(skill.content.length).toBeGreaterThan(0);
 }
 for(const id of denied)expect(()=>loadTradeSkills(role,[id])).toThrow('SKILL_DENIED');
});
it.each(['oversize','escape'])('rejects %s instruction files in an isolated catalog root',kind=>{
 const dir=mkdtempSync(join(tmpdir(),'trade-skills-'));
 try{
  const target=join(dir,'skills/trade/lead-qualification');
  mkdirSync(target,{recursive:true});
  if(kind==='oversize')writeFileSync(join(target,'SKILL.md'),'中'.repeat(5334));
  else {writeFileSync(join(dir,'outside.md'),'outside');symlinkSync(join(dir,'outside.md'),join(target,'SKILL.md'));}
  const moduleUrl=pathToFileURL(join(process.cwd(),'scripts/agents/skills.mjs')).href;
  const result=spawnSync(process.execPath,['--input-type=module','-e',`import {loadTradeSkills} from ${JSON.stringify(moduleUrl)};try{loadTradeSkills('prospecting',['lead-qualification']);process.exitCode=2;}catch(e){if(e.message!=='SKILL_DENIED')throw e;}`],{cwd:dir,encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it.each(['prospecting','diligence','outreach_draft'])('keeps all MCP bans after injecting skills for %s',async roleCode=>{
 const api=createTools({companyId:'11111111-1111-4111-8111-111111111111',roleCode,read:async()=>({items:[]}),write:async()=>{throw Error('UNEXPECTED_WRITE');}});
 const listed=await api.listCurrent();
 for(const name of ['plan_confirm','run_claim','pipeline_advance','run_resume','outreach_approve','outreach_reject','outreach_send']){
  expect(listed.some((t:any)=>t.name===name)).toBe(false);
  await expect(api.call(name,{})).rejects.toThrow('UNKNOWN_TOOL');
 }
 const instructions=listed.filter((t:any)=>!t.annotations.readOnlyHint);
 for(const skill of loadTradeSkills(roleCode))expect(instructions.some((t:any)=>t.description.includes(skill.content))).toBe(true);
});
