import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('@/modules/business/ui/client',async importOriginal=>({...await importOriginal<object>(),useResource:()=>({data:{items:[]},loading:false,error:'',reload:vi.fn()})}));
const actor=vi.hoisted(()=>({id:'human-admin',role:'admin'}));
vi.mock('@/modules/business/ui/shared',async importOriginal=>({...await importOriginal<object>(),useActor:()=>actor}));
import {Prospecting} from '@/modules/business/ui/prospecting';

it('renders the maps search panel inside discover with explicit import-only copy',()=>{
 const html=renderToStaticMarkup(createElement(Prospecting));
 for(const label of ['地图搜客 · aiclient','国家 *','城市','行业 / 关键词 *','返回数量','官网补邮箱','开始搜客','仅写入线索库，不会发信或提交审批','无邮箱'])expect(html).toContain(label);
 expect(html).toContain('JSON 批量导入（含 Maps）');
 expect(html).not.toContain('经 Brevo 发送');
});
