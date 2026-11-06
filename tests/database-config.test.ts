import {it,expect} from 'vitest';
import {validateDatabaseUrl} from '@/server/db/config';
it('rejects privileged database logins rather than silently using postgres',()=>{expect(()=>validateDatabaseUrl('postgres://postgres@localhost/test')).toThrow();expect(()=>validateDatabaseUrl('postgres://service_role@localhost/test')).toThrow();expect(()=>validateDatabaseUrl('invalid')).toThrow();expect(()=>validateDatabaseUrl('postgres://app_backend.project@localhost/test')).not.toThrow();});
