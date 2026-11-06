const codes=new Set(['ECONNRESET','ETIMEDOUT','ENOENT','SELF_SIGNED_CERT_IN_CHAIN','UNDEFINED_VALUE','UNSAFE_TRANSACTION','NOT_TAGGED_CALL','CONNECTION_CLOSED','CONNECTION_ENDED','CONNECTION_DESTROYED','CONNECT_TIMEOUT']);
const sqlstate=/^(?:01|02|03|08|09|0A|0B|0F|0L|0P|0Z|20|21|22|23|24|25|26|27|28|2B|2D|2F|34|38|39|3B|3D|3F|40|42|44|53|54|55|57|58|F0|HV|P0|XX)[A-Z0-9]{3}$/;
const names=new Set(['TypeError','SyntaxError','RangeError','ReferenceError','ZodError','IdentityError','PostgresError']);
export function reportDatabaseFailure(location:'records.request'|'records.read',error:unknown){
 const value=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
 const code=typeof value==='string'&&(codes.has(value)||sqlstate.test(value))?value:'UNKNOWN';
 const errorType=error instanceof Error&&names.has(error.name)?error.name:'Error';
 const frames=error instanceof TypeError?(error.stack??'').split('\n').slice(1).flatMap(line=>{
  const match=line.match(/\/var\/task\/\.next\/server\/((?:chunks\/[A-Za-z0-9_.\/-]+|app\/api\/workspace\/records\/route)\.js):(\d+):(\d+)/);
  return match?[{file:match[1],line:Number(match[2]),column:Number(match[3])}]:[];
 }).slice(0,3):[];
 const category=error instanceof TypeError&&error.message.includes('is not a function')?'NOT_A_FUNCTION':error instanceof TypeError&&error.message.includes('Cannot read properties')?'MISSING_PROPERTY':'UNCLASSIFIED';
 console.error(JSON.stringify({event:'database.request.failed',location,requestId:crypto.randomUUID(),code,errorType,category,frames}));
}
