import {describe,it,expect} from 'vitest';
import {assessCapability,type Evidence} from '../../experiments/assistant-e0/evidence';
const proof:Evidence={capability:'send_text',environment:'real_test',outcome:'pass',reference:'synthetic-case-1',revision:'v1'};
describe('capability evidence gate',()=>{
 it('does not promote absent or simulated proof',()=>{expect(assessCapability([])).toBe('unverified');expect(assessCapability([{...proof,environment:'mock'}])).toBe('unverified');});
 it('accepts referenced real proof only',()=>{expect(assessCapability([proof])).toBe('supported');for(const field of ['reference','revision'] as const)expect(assessCapability([{...proof,[field]:' '}])).toBe('unverified');});
 it('fails closed for failed, unrun, mixed capability or revision evidence',()=>{expect(assessCapability([proof,{...proof,outcome:'fail'}])).toBe('unsupported');expect(assessCapability([{...proof,outcome:'not_run'}])).toBe('unverified');expect(assessCapability([proof,{...proof,capability:'read_text'}])).toBe('unverified');expect(assessCapability([proof,{...proof,revision:'v2'}])).toBe('unverified');});
});
