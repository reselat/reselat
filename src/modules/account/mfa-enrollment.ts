export function totpEnrollmentOptions():{factorType:'totp';friendlyName?:string}{
 return {factorType:'totp'};
}
export function enrollmentErrorMessage(error:unknown):string{
 const code=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
 if(code==='mfa_factor_name_conflict')return '已有同名的验证器绑定记录，请刷新页面后重新绑定。';
 if(code==='mfa_max_enrolled_factors')return '验证器数量已达上限，请联系管理员处理未完成的绑定。';
 if(code==='mfa_totp_enroll_not_enabled')return '项目尚未启用验证器绑定，请联系管理员。';
 if(code==='session_expired'||code==='session_not_found')return '登录已过期，请重新登录后绑定。';
 return '验证器绑定未完成，请稍后重试。';
}
