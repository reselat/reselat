const messages:Record<string,string>={
 PASSWORD_REQUIREMENTS:'初始密码未满足身份项目的密码策略。请检查长度、字符组合及项目设置后重新提交。',
 EMAIL_ALREADY_REGISTERED:'身份项目中已存在该邮箱的登录账号。请核对已有账号，避免重复创建。',
 INVALID_EMAIL:'身份服务未接受该邮箱格式，请检查多余空格或地址格式。',
 EMAIL_NOT_ALLOWED:'身份项目的邮箱或域名策略不允许此地址，请检查 Auth 设置。',
 AUTH_ADMIN_DENIED:'身份服务拒绝管理员创建请求，请检查服务端 Secret key 的项目归属和管理权限。',
 AUTH_RATE_LIMITED:'身份服务暂时限制请求频率，请稍后再提交。',
 AUTH_REQUEST_INVALID:'身份服务认为创建参数不符合要求，请反馈此安全错误码以便排查。',
 AUTH_REQUEST_REJECTED:'身份服务拒绝了创建请求，尚未归类原因。请反馈安全错误码，不要发送邮箱或密码。'
};
export function creationFailureMessage(code:unknown){const key=typeof code==='string'&&Object.hasOwn(messages,code)?code:'AUTH_REQUEST_REJECTED';return messages[key]+'（'+key+'）';}
