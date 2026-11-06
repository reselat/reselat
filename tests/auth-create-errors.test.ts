import {it,expect} from 'vitest';
import {classifyAuthCreateError} from '../src/server/admin/auth-create-errors';
import {creationFailureMessage} from '../src/modules/account/admin/create-errors';
it.each([
 [{status:422,code:'weak_password'},'PASSWORD_REQUIREMENTS'],
 [{status:422,code:'email_exists'},'EMAIL_ALREADY_REGISTERED'],
 [{status:400,code:'email_address_invalid'},'INVALID_EMAIL'],
 [{status:403,code:'not_admin'},'AUTH_ADMIN_DENIED'],
 [{status:429,code:'over_request_rate_limit'},'AUTH_RATE_LIMITED'],
 [{status:400,code:'validation_failed'},'AUTH_REQUEST_INVALID']
])('classifies a definite Auth rejection without exposing upstream text', (error,expected)=>{
 const result=classifyAuthCreateError({...error,message:'PRIVATE_EMAIL_AND_PASSWORD'});expect(result.message).toBe('CREATE_REJECTED');expect(result).toMatchObject({safeCode:expected});expect(JSON.stringify(result)).not.toContain('PRIVATE_EMAIL_AND_PASSWORD');
});
it('preserves unknown outcomes and never suggests duplicate email for an unknown rejection',()=>{
 expect(classifyAuthCreateError({status:500}).message).toBe('AUTH_RESULT_UNKNOWN');
 expect(classifyAuthCreateError({status:408}).message).toBe('AUTH_RESULT_UNKNOWN');
 expect(creationFailureMessage('UNKNOWN_PRIVATE_CODE')).not.toContain('邮箱是否已注册');
 expect(creationFailureMessage('AUTH_ADMIN_DENIED')).toContain('服务');
});
