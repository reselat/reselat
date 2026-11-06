const hints:Record<string,string>={
 TERMINAL_INPUT_INVALID:'终端控制序列不完整，请重新复制输入，不要使用方向键编辑隐藏内容。',
 MULTILINE_INPUT:'粘贴内容含换行，请只粘贴一行连接串或密码。',
 TLS_CA_INVALID:'CA文件无效，请使用从Supabase项目数据库设置下载的公开CA证书，不要使用私钥。',
 INVALID_CONNECTION_STRING:'连接串格式不正确。请原样复制URI，不要附带引号或终端提示文字。',
 WRONG_PROJECT_OR_USER:'连接地址、项目或用户名不匹配。请使用外贸测试项目的postgres连接。',
 CONNECTION_PARAMETERS_NOT_ALLOWED:'连接串末尾存在查询参数。请去掉问号及其后内容，脚本会强制验证TLS。',
 CONNECTION_PORT_MISMATCH:'请选择Session pooler的5432端口，不要使用6543事务池端口。',
 CONNECTION_DATABASE_MISMATCH:'目标数据库必须为postgres。',
 PASSWORD_MISSING:'尚未输入数据库密码。它与员工登录密码不同。',
 TTY_REQUIRED:'请在本机交互终端运行，不要通过管道或重定向输入凭据。',
 CANCELLED:'你已取消输入，未继续配置。',
 ROLE_MISSING:'目标库尚未初始化app_backend角色。',
 ROLE_ALREADY_CONFIGURED:'专用账号已经启用。请停止重复初始化，检查本机已有配置。',
 ROLE_UNSAFE:'专用角色权限状态不符合预期，已停止配置。',
 COMPANY_NOT_FOUND:'目标数据库没有找到预期测试公司，已停止配置。',
 CONNECTION_VERIFICATION_FAILED:'专用连接身份或管理员数量核验未通过。',
 '28P01':'数据库端点拒绝了密码认证。若已重设仍失败，请核对项目与连接池路由，不要连续重置密码。',
 '28000':'数据库账号认证未通过，请核对连接方式和项目。',
 '42P18':'配置SQL的参数类型未明确，请更新配置脚本后再运行；无需重置数据库密码。',
 '42501':'数据库权限不足，当前账号可能不能配置专用角色。',
 ENOTFOUND:'无法解析数据库域名，请检查网络与连接地址。',
 EAI_AGAIN:'数据库域名暂时无法解析，请检查网络。',
 ENETUNREACH:'网络不可达；若使用直连，请改用Session pooler。',
 ECONNREFUSED:'数据库端口拒绝连接，请检查项目状态和端口。',
 ECONNRESET:'连接被中断，请检查网络和项目状态。',
 ETIMEDOUT:'数据库连接超时，请检查网络或网络访问限制。',
 CONNECT_TIMEOUT:'数据库连接超时，请检查网络或网络访问限制。',
 CONNECTION_CLOSED:'数据库连接被关闭，请检查网络和项目状态。',
 SELF_SIGNED_CERT_IN_CHAIN:'TLS证书链无法验证，需要配置受信任的数据库CA证书；不要关闭证书验证。',
 DEPTH_ZERO_SELF_SIGNED_CERT:'TLS证书无法验证，需要配置数据库CA证书；不要关闭证书验证。',
 UNABLE_TO_VERIFY_LEAF_SIGNATURE:'TLS证书链不完整，需要配置数据库CA证书。',
 UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'本机缺少数据库CA证书。',
 CERT_HAS_EXPIRED:'数据库TLS证书已过期或本机时间异常。',
 ERR_TLS_CERT_ALTNAME_INVALID:'数据库域名与TLS证书不匹配，已停止连接。',
 EACCES:'本机配置文件无写入权限。',
 ENOENT:'本机配置文件不存在，请检查项目目录。'
};
const stages=new Set(['load_ca','input','parse','password','connect','check_role','check_company','prepare_file','configure_role','save_file','verify']);
export function safeSetupDiagnostic(error:unknown,stage:string,committed:boolean):string{
 let code='UNKNOWN';
 if(typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'&&Object.hasOwn(hints,error.code))code=error.code;
 else if(error instanceof Error&&Object.hasOwn(hints,error.message))code=error.message;
 const safeStage=stages.has(stage)?stage:'unknown';
 return `配置未完成（阶段：${safeStage}；错误码：${code}）。`+(hints[code]??'请只反馈阶段和错误码，不要发送连接串、密码或原始错误。')+(committed?' 专用账号已启用，配置文件已保留；不要重复初始化。':'');
}
