import {IdentityError} from './employee';
export function sameOrigin(request:Request){const expected=process.env.APP_ORIGIN;if(!expected||request.headers.get('origin')!==expected)throw new IdentityError('FORBIDDEN');}
export function accountError(e:unknown){const code=e instanceof IdentityError?e.code:'REQUEST_FAILED';return Response.json({code},{status:code==='UNAUTHENTICATED'?401:code==='NOT_CONFIGURED'?503:code==='REQUEST_FAILED'?400:403,headers:{'cache-control':'no-store'}});}
