import {it,expect} from 'vitest';
import {MAX_NO_REPLY_REDRAFTS} from '@/server/business/followup-redraft';
it('caps no-reply redrafts at two',()=>expect(MAX_NO_REPLY_REDRAFTS).toBe(2));
