export function memberCreationReady(env:Record<string,string|undefined>){return Boolean(env.SUPABASE_AUTH_ADMIN_KEY);}
