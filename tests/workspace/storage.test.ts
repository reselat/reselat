import { it,expect } from 'vitest';
import { decodeWorkspace } from '@/modules/workspace/storage-codec';
import { initialWorkspace } from '@/modules/workspace/seed';
it('roundtrips maintained data across refresh without converting integer strings',()=>{const s=initialWorkspace();expect(decodeWorkspace(JSON.stringify(s))).toEqual(s);});
it('rejects corrupt and incompatible storage instead of silently replacing records',()=>{expect(()=>decodeWorkspace('{bad')).toThrow();expect(()=>decodeWorkspace('{"version":1}')).toThrow();});
