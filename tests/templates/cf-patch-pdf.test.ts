import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
// Build tooling is JavaScript and is deliberately executable without TypeScript.
// @ts-expect-error build script has no declaration file
import {patchStandardFontRequires,extractYogaWasm} from '../../scripts/cf-patch-pdf.mjs';
it('replaces all fourteen standard font references',()=>{const source=Array.from({length:14},(_,i)=>`require$1("#standard-fonts/Font${i}")`).join(';');const result=patchStandardFontRequires(source);expect(result.count).toBe(14);expect(result.code).not.toContain('require$1');expect(result.code).toContain('__RESELAT_PDFKIT_STD_FONTS__');});
it('reports mismatching replacement counts',()=>{expect(patchStandardFontRequires('unrelated()').count).toBe(0);});
it('extracts valid Yoga WebAssembly and rejects invalid input',async()=>{const wasm=extractYogaWasm(await readFile('node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js','utf8'));expect(Buffer.from(wasm).subarray(0,4).toString('hex')).toBe('0061736d');expect(()=>extractYogaWasm('invalid')).toThrow();});
