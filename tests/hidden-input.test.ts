import {it,expect} from 'vitest';
import {hiddenInputState,consumeHiddenInput} from '../scripts/hidden-input';
it('strips terminal bracketed paste wrappers without changing the password',()=>{const state=consumeHiddenInput(hiddenInputState(),'\x1b[200~TEST@#-ONLY\x1b[201~\r');expect(state.value).toBe('TEST@#-ONLY');expect(state.done).toBe(true);expect(state.controlsRemoved).toBe(true);});
it('handles paste escape sequences split between terminal input chunks',()=>{let state=hiddenInputState();for(const chunk of ['\x1b[2','00~TEST','\x1b[201','~','\r'])state=consumeHiddenInput(state,chunk);expect(state.value).toBe('TEST');expect(state.done).toBe(true);});
it('keeps ordinary spaces and special characters exactly and supports backspace and cancellation',()=>{expect(consumeHiddenInput(hiddenInputState(),' x@#%\u007f%\r').value).toBe(' x@#%');expect(consumeHiddenInput(hiddenInputState(),'\u0003').cancelled).toBe(true);});
