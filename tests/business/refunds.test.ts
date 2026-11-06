import {expect,it,vi} from 'vitest';
import {csvCell,buildZip} from '../../src/server/refunds/archive';
import {unzipSync} from 'fflate';
it('escapes spreadsheet formulas including leading whitespace and quotes',()=>{
 expect(csvCell(' =HYPERLINK("bad")')).toContain("'");expect(csvCell('plain')).toBe('"plain"');expect(csvCell('a"b')).toBe('"a""b"');
});
it('creates a real bounded ZIP and refuses path traversal or duplicate paths',()=>{
 const bytes=buildZip([{name:'files/synthetic.txt',bytes:new TextEncoder().encode('Synthetic')}]);
 expect(new TextDecoder().decode(unzipSync(bytes)['files/synthetic.txt'])).toBe('Synthetic');
 expect(()=>buildZip([{name:'../bad',bytes:new Uint8Array([1])}])).toThrow('EXPORT_LIMIT');
 expect(()=>buildZip([{name:'same',bytes:new Uint8Array([1])},{name:'same',bytes:new Uint8Array([1])}])).toThrow('EXPORT_LIMIT');
 expect(()=>buildZip(Array.from({length:101},(_,i)=>({name:String(i),bytes:new Uint8Array([1])})))).toThrow('EXPORT_LIMIT');
});

it('rebuilds the identical ZIP bytes after a later recovery attempt',()=>{try{vi.useFakeTimers();const entries=[{name:'manifest.json',bytes:new TextEncoder().encode('synthetic')}];vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));const first=buildZip(entries);vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));expect(buildZip(entries)).toEqual(first);}finally{vi.useRealTimers();}});
