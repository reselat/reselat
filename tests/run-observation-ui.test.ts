import {createElement} from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {RunObservation} from '@/modules/business/ui/run-observation';
it('renders read-only timeline and explicitly labels zero-call placeholder costs',()=>{
 const html=renderToStaticMarkup(createElement(RunObservation,{timeline:[{seq:0,role_code:'prospecting',action:'leads_upsert',state:'succeeded',evidence_summary:'lead-id',duration_ms:123}],usage:{source:'placeholder',calls:0,input_tokens:0,output_tokens:0,estimated_usd_micros:0,currency:'USD'}}));
 for(const value of ['步骤时间线','prospecting','leads_upsert','lead-id','123 ms','占位','输入 token','输出 token','0.000000'])expect(html).toContain(value);
 expect(html).not.toContain('<button');expect(html).not.toContain('<form');
});
