import {it,expect} from 'vitest';
import {buildRunObservation} from '@/server/business/run-observation';
it('orders dependency-driven execution by completion time rather than declaration seq',()=>{
 const start=Date.parse('2026-11-05T00:00:00Z');
 const steps=[{seq:0,created_at:new Date(start+2000),kind:'diligence_save_report'},{seq:3,created_at:new Date(start+1000),kind:'leads_upsert'}];
 const {timeline}=buildRunObservation({started_at:new Date(start)},steps);
 expect(timeline.map(s=>s.seq)).toEqual([3,0]);
 expect(timeline.map(s=>s.duration_ms)).toEqual([1000,1000]);
});
