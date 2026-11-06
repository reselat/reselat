import {it,expect} from 'vitest';
import {totpEnrollmentOptions,enrollmentErrorMessage} from '../src/modules/account/mfa-enrollment';
it('does not reuse a fixed friendly name after an interrupted enrollment',()=>{
 expect(totpEnrollmentOptions()).toEqual({factorType:'totp'});
});
it('classifies enrollment failure without displaying upstream messages',()=>{
 expect(enrollmentErrorMessage({code:'mfa_factor_name_conflict',message:'PRIVATE'})).toContain('同名');
 expect(enrollmentErrorMessage({code:'mfa_max_enrolled_factors'})).toContain('上限');
 expect(enrollmentErrorMessage({message:'PRIVATE'})).not.toContain('PRIVATE');
});
