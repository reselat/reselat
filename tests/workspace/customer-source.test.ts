import {it,expect} from 'vitest';
import {partySchema} from '@/modules/workspace/model';
import {initialWorkspace} from '@/modules/workspace/seed';
import {decodeWorkspace} from '@/modules/workspace/storage-codec';
it('accepts the supported customer acquisition channels and preserves them across storage',()=>{for(const source of ['ads','website','social','exhibition','referral','other','unknown']){const state=initialWorkspace();state.customers[0]=partySchema.parse({...state.customers[0],source});expect(decodeWorkspace(JSON.stringify(state)).customers[0].source).toBe(source);}});
it('rejects invalid channel values and keeps historical customers readable without a source',()=>{const customer=initialWorkspace().customers[0];expect(partySchema.safeParse({...customer,source:'invalid'}).success).toBe(false);expect(partySchema.safeParse(customer).success).toBe(true);});
