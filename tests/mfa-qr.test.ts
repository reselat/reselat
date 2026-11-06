import {it,expect} from 'vitest';
import {getImageProps} from 'next/image';
import {mfaQrSource} from '../src/modules/account/mfa-qr';
const svg='<svg xmlns="http://www.w3.org/2000/svg">\n<rect width="1" height="1"/>\n</svg>\n';
it('renders a multiline Supabase SVG data URI without Next image source errors',()=>{
 const src=mfaQrSource('data:image/svg+xml;utf-8,'+svg);
 expect(()=>getImageProps({src,width:220,height:220,alt:'Synthetic test',unoptimized:true})).not.toThrow();
 expect(decodeURIComponent(src.slice(src.indexOf(',')+1))).toBe(svg);
 expect(src).not.toMatch(/[\r\n]/);
});
it('accepts raw SVG and already encoded SVG without double encoding',()=>{
 const src=mfaQrSource(svg);
 expect(mfaQrSource(src)).toBe(src);
 expect(decodeURIComponent(src.slice(src.indexOf(',')+1))).toBe(svg);
});
