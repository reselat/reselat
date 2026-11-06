import {it,expect} from 'vitest';
import {commandFingerprint,assertPrecision} from '../../src/server/business/command-values';
it('canonicalizes command fingerprints without storing command contents',()=>{
 expect(commandFingerprint({a:1,b:{c:'x'}})).toBe(commandFingerprint({b:{c:'x'},a:1}));
 expect(commandFingerprint({a:1})).not.toBe(commandFingerprint({a:2}));expect(()=>commandFingerprint({a:NaN})).toThrow();
});
it('rejects negative, floating, overprecision and numeric database overflow',()=>{
 expect(assertPrecision('100.1234','quantity')).toBe('100.1234');
 for(const value of ['-1','0.12345','1e3','100000000000000000000'])expect(()=>assertPrecision(value,'quantity')).toThrow();
 expect(()=>assertPrecision('9'.repeat(39),'minor')).toThrow();expect(()=>assertPrecision('1.1','minor')).toThrow();
});
