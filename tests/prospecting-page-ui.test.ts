import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({items:[] as Record<string,unknown>[]}));
vi.mock('@/modules/business/ui/client',async importOriginal=>({...await importOriginal<object>(),useResource:({view}:{view:string})=>({data:{items:view==='approval-queue'?fixture.items:[]},loading:false,error:'',reload:vi.fn()})}));
const actor=vi.hoisted(()=>({id:'human-admin',role:'admin'}));
vi.mock('@/modules/business/ui/shared',async importOriginal=>({...await importOriginal<object>(),useActor:()=>actor}));
import {Prospecting} from '@/modules/business/ui/prospecting';
it('renders the E6 entry forms and all pipeline targets without a sending action',()=>{
 const html=renderToStaticMarkup(createElement(Prospecting));
 for(const label of ['获客工作台','不会发送邮件','JSON 批量导入','保存线索','人工审批队列','回写客户与跟进'])expect(html).toContain(label);
 for(const id of ['discover','diligence','draft','approval','writeback'])expect(html).toContain('id="prospecting-'+id+'"');
 expect(html).toContain('prospecting-workbench');
 expect(html).not.toContain('经 Brevo 发送');
});
it('keeps workbench forms and pipeline hidden from sales',()=>{
 actor.role='sales';
 try{const html=renderToStaticMarkup(createElement(Prospecting));expect(html).toContain('仅管理员');expect(html).not.toContain('<form');expect(html).not.toContain('获客流水线');}finally{actor.role='admin';}
});

it('shows explicit approval partitions and writeback safety copy',()=>{
 const html=renderToStaticMarkup(createElement(Prospecting));
 for(const label of ['待审批','已批准 · 待回写 / 已回写','已拒绝','回写 ≠ 已发信','已通过待通道'])expect(html).toContain(label);
});

it('renders persisted writeback success, customer link and only valid row actions',()=>{
 fixture.items=[{id:'written',state:'approved',written_back_at:'2026-11-05T00:00:00Z',customer_id:'customer-123'}];
 try{
  const html=renderToStaticMarkup(createElement(Prospecting));
  expect(html).toContain('已回写客户与跟进');
  expect(html).toContain('/workspace/customers?focus=customer-123');
  expect(html).toContain('查看客户与跟进');
  expect(html).not.toMatch(/<button[^>]*>回写客户与跟进/);
  expect(html).toContain('经 Brevo 发送');
  fixture.items=[{id:'approved',state:'approved'},{id:'pending',state:'pending'},{id:'rejected',state:'rejected'}];
  const actionable=renderToStaticMarkup(createElement(Prospecting));
  for(const label of ['人工批准','人工拒绝','回写客户与跟进','已拒绝，不执行回写。'])expect(actionable).toContain(label);
 }finally{fixture.items=[];}
});
