import { Font } from '@react-pdf/renderer';
import path from 'node:path';
import { create } from 'fontkit';
let registered=false;
let loading:Promise<void>|undefined;
let cloudflareRegistered=false;
export async function ensurePdfFonts(){
 if(process.env.DEPLOYMENT_TARGET!=='cloudflare'){
  if(!registered){Font.register({family:'NotoSC',src:path.join(process.cwd(),'assets/fonts/NotoSansSC-Regular.otf')});registered=true;}
  return;
 }
 if(!loading)loading=(async()=>{
  // Placeholder source; its data is injected below so @react-pdf/font never reads fs or fetches it.
  if(!cloudflareRegistered){Font.register({family:'NotoSC',src:'https://assets.invalid/_pdf-fonts/NotoSansSC-Regular.otf'});cloudflareRegistered=true;}
  const context=(globalThis as typeof globalThis & {[key:symbol]:{env:{ASSETS:{fetch:typeof fetch}}}})[Symbol.for('__cloudflare-context__')];
  const response=await context.env.ASSETS.fetch('https://assets.invalid/_pdf-fonts/NotoSansSC-Regular.otf');
  if(!response.ok)throw Error('Font response '+response.status);
  const data=create(new Uint8Array(await response.arrayBuffer()));
  const source=Font.getFont({fontFamily:'NotoSC'}) as unknown as {data:unknown;loadResultPromise:Promise<void>};
  source.data=data;source.loadResultPromise=Promise.resolve();
 })().catch(cause=>{loading=undefined;throw new Error('PDF_FONT_UNAVAILABLE',{cause});});
 await loading;
}
