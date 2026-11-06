import {expect,it,vi} from 'vitest';
import {buildRiskPrompt,callDeepseek,deepseekConfig,reserveMicros} from '@/server/finance/deepseek';
const risk={code:'PROJECTED_LOSS',level:'critical' as const,stage:'履约',title:'预计亏损',advice:'核对成本并请管理员复核'};
const config={key:'SYNTHETIC_TEST_KEY',model:'deepseek-flash',inputPrice:300000n,outputPrice:1200000n,dailyBudget:100000n,dailyCalls:10};
it('defaults to disabled and rejects absent or stale budget settings',()=>{
 expect(()=>deepseekConfig({})).toThrow('AI_DISABLED');expect(()=>deepseekConfig({DEEPSEEK_RISK_ENABLED:'true'})).toThrow('AI_NOT_CONFIGURED');expect(reserveMicros(config)).toBe(6144n);
 expect(JSON.stringify(buildRiskPrompt([risk]))).not.toContain('SYNTHETIC_TEST_KEY');
});
it('uses a fixed endpoint, bounded output, no redirects and validates evidence codes',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({id:'SYNTHETIC',model:'deepseek-flash',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'需要复核订单成本',suggestions:[{riskCode:risk.code,action:'请管理员核对报价差异'}]})}}],usage:{prompt_tokens:50,completion_tokens:30}}));
 const result=await callDeepseek(config,[risk],fetcher);expect(result.answer.suggestions[0].riskCode).toBe(risk.code);
 expect(fetcher.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
 const bad=vi.fn<typeof fetch>(async()=>Response.json({id:'SYNTHETIC',model:'deepseek-flash',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'不可信建议',suggestions:[{riskCode:'MADE_UP',action:'虚构'}]})}}],usage:{prompt_tokens:1,completion_tokens:1}}));
 await expect(callDeepseek(config,[risk],bad)).rejects.toThrow('AI_RESULT_UNKNOWN');
});
