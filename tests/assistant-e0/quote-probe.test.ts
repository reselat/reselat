import {it,expect} from 'vitest';
import rows from './fixtures/quote-expected.json';
import {compareQuote} from '../../experiments/assistant-e0/quote-probe';
it('matches order independent exact fields but never publishes',()=>{expect(compareQuote([...rows].reverse(),rows)).toEqual({exact:true,differences:[],publishable:false});});
it.each([{page:2},{currency:'EUR'},{unit:'pc'},{product:'Synthetic Sample'},{conditions:''},{unitPrice:'12.31'},{sourceVersion:'v2'}])('rejects corrupted quote field %o',patch=>{const result=compareQuote([{...rows[0],...patch},rows[1]],rows);expect(result.exact).toBe(false);expect(result.differences.length).toBeGreaterThan(0);expect(result.publishable).toBe(false);});
it('rejects missing or duplicated rows',()=>{expect(compareQuote(rows.slice(1),rows).exact).toBe(false);expect(compareQuote([rows[0],rows[0]],rows).exact).toBe(false);});
it('does not treat empty extraction as a valid quote',()=>expect(compareQuote([],[]).exact).toBe(false));
