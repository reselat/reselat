import {it,expect} from 'vitest';
import {assessModelCoverage,type CallPath} from '../../experiments/assistant-e0/model-coverage';
const paths:CallPath[]=['reply','memory','compaction','background'].map(name=>({name,sourceRef:'pinned-source:'+name,status:'controlled'}));
it('blocks incomplete inventories and unverified or bypassing paths',()=>{expect(assessModelCoverage(paths,false)).toBe('blocked');expect(assessModelCoverage(paths.slice(0,3),true)).toBe('blocked');for(const status of ['unverified','bypasses_gateway'] as const)expect(assessModelCoverage([...paths,{name:'extra',sourceRef:'source',status}],true)).toBe('blocked');expect(assessModelCoverage(paths.map(p=>({...p,sourceRef:' '})),true)).toBe('blocked');});
it('allows only fully referenced controlled inventory for scoped trial',()=>expect(assessModelCoverage(paths,true)).toBe('eligible_for_scoped_trial'));
