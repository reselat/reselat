import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {WorkspaceNavigation} from '@/modules/business/ui/shared';
import {ProspectingPipeline,currentProspectingStep} from '@/modules/business/ui/prospecting-pipeline';
it('retains role visibility and promotes local admin tasks above business groups',()=>{
 const render=(role:'admin'|'sales'|'operations',localTest=false)=>renderToStaticMarkup(createElement(WorkspaceNavigation,{role,path:'/workspace/prospecting',localTest}));
 const admin=render('admin',true);
 for(const label of ['增长','履约','资产','财务','获客工作台'])expect(admin).toContain(label);
 expect(admin.indexOf('任务中心')).toBeLessThan(admin.indexOf('增长'));
 expect(render('admin')).not.toContain('/workspace/agent-runs');
 for(const role of ['sales','operations'] as const){expect(render(role,true)).not.toContain('/workspace/prospecting');expect(render(role,true)).not.toContain('/workspace/agent-runs');expect(render(role)).not.toContain('/workspace/suppliers');}
 expect(render('sales')).not.toContain('/workspace/purchases');expect(render('operations')).toContain('/workspace/purchases');
 for(const key of ['customers','assistant','knowledge','catalog','suppliers','orders','purchases','documents','shipments','payments','expenses','costs','risks','refunds','signatures','settings'])expect(admin).toContain('/workspace/'+key);
});
it.each([
 [false,false,undefined,'discover'],[true,false,undefined,'diligence'],[true,true,undefined,'draft'],
 [true,true,'draft','draft'],[true,true,'pending','approval'],[true,true,'approved','writeback'],[true,true,'rejected','draft'],
 [true,false,'pending','approval'],
])('maps selection %s, diligence %s, latest draft %s to %s',(selected,hasReport,draftState,expected)=>{
 expect(currentProspectingStep(Boolean(selected),Boolean(hasReport),draftState as string|undefined)).toBe(expected);
});
it('renders five accessible section links with exactly one current step',()=>{
 const html=renderToStaticMarkup(createElement(ProspectingPipeline,{current:'approval'}));
 for(const id of ['discover','diligence','draft','approval','writeback'])expect(html).toContain('href="#prospecting-'+id+'"');
 expect(html.match(/aria-current="step"/g)).toHaveLength(1);
 for(const label of ['发现 / 搜客','筛选 / 背调','定制开发信','人工审批','回写客户'])expect(html).toContain(label);
 expect(html).not.toContain('<button');
});
