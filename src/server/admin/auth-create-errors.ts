export class AuthCreateRejected extends Error{constructor(public readonly safeCode:string){super('CREATE_REJECTED');}}
export function classifyAuthCreateError(error:unknown):Error{
 const status=typeof error==='object'&&error!==null&&'status' in error&&typeof error.status==='number'?error.status:undefined;
 const code=typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'?error.code:undefined;
 if(!status||status<400||status>=500||status===408)return new Error('AUTH_RESULT_UNKNOWN');
 if(status===401||status===403||code==='not_admin')return new AuthCreateRejected('AUTH_ADMIN_DENIED');
 if(status===429||code==='over_request_rate_limit')return new AuthCreateRejected('AUTH_RATE_LIMITED');
 const codes:Record<string,string>={weak_password:'PASSWORD_REQUIREMENTS',email_exists:'EMAIL_ALREADY_REGISTERED',user_already_exists:'EMAIL_ALREADY_REGISTERED',email_address_invalid:'INVALID_EMAIL',email_address_not_authorized:'EMAIL_NOT_ALLOWED',validation_failed:'AUTH_REQUEST_INVALID',bad_json:'AUTH_REQUEST_INVALID'};
 return new AuthCreateRejected(code&&Object.hasOwn(codes,code)?codes[code]:'AUTH_REQUEST_REJECTED');
}
