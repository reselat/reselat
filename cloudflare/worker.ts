import handler from '../.open-next/worker.js';
import yogaWasm from '../.open-next/reselat/yoga-3.2.1.wasm';
import Courier from 'pdfkit/standard-fonts/Courier';
import CourierBold from 'pdfkit/standard-fonts/CourierBold';
import CourierOblique from 'pdfkit/standard-fonts/CourierOblique';
import CourierBoldOblique from 'pdfkit/standard-fonts/CourierBoldOblique';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import HelveticaOblique from 'pdfkit/standard-fonts/HelveticaOblique';
import HelveticaBoldOblique from 'pdfkit/standard-fonts/HelveticaBoldOblique';
import TimesRoman from 'pdfkit/standard-fonts/TimesRoman';
import TimesBold from 'pdfkit/standard-fonts/TimesBold';
import TimesItalic from 'pdfkit/standard-fonts/TimesItalic';
import TimesBoldItalic from 'pdfkit/standard-fonts/TimesBoldItalic';
import Symbol from 'pdfkit/standard-fonts/Symbol';
import ZapfDingbats from 'pdfkit/standard-fonts/ZapfDingbats';
globalThis.__RESELAT_PDFKIT_STD_FONTS__ = {Courier,CourierBold,CourierOblique,CourierBoldOblique,Helvetica,HelveticaBold,HelveticaOblique,HelveticaBoldOblique,TimesRoman,TimesBold,TimesItalic,TimesBoldItalic,Symbol,ZapfDingbats};
// yoga-layout 3.2.1: validated by the build patch; do not intercept unrelated wasm.
const YOGA_WASM_BYTE_LENGTH = 71736;
const original = WebAssembly.instantiate.bind(WebAssembly);
WebAssembly.instantiate = async (source, imports) => {
 if ((source instanceof ArrayBuffer || ArrayBuffer.isView(source)) && source.byteLength === YOGA_WASM_BYTE_LENGTH) {const instance = await original(yogaWasm, imports);return {module:yogaWasm,instance};}
 return original(source, imports);
};
export default handler;
export * from '../.open-next/worker.js';
