import {NextResponse} from 'next/server';
import {localTestEnabled,localTestAuthority} from '@/server/local-test/guard';
import {authClient} from '@/server/auth/supabase';
import {sameOrigin,accountError} from '@/server/auth/http';
export async function POST(request:Request){try{sameOrigin(request);if(localTestEnabled()){if(!localTestAuthority(request.headers.get('host'),request.headers.get('origin')))return new Response(null,{status:403});const response=NextResponse.json({ok:true});response.cookies.set('reselat-local-role','',{httpOnly:true,sameSite:'strict',path:'/',maxAge:0});return response;}const auth=await authClient();const {error}=await auth.auth.signOut();if(error)throw error;return Response.json({ok:true},{headers:{'cache-control':'no-store'}});}catch(e){return accountError(e);}}
