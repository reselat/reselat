import {createHash} from 'node:crypto';
export type FileMime='application/pdf'|'image/png'|'image/jpeg';
export function validateFile(input:{name:string;mime:string},bytes:Uint8Array,signature=false,generatedExport=false){
 if(generatedExport){if(input.mime==='application/pdf')return validateFile(input,bytes,false,false);if(bytes.length>52428800||!bytes.length||!input.name||/[\x00-\x1f/\\]/.test(input.name)||input.name.includes('..')||!((input.mime==='application/zip'&&/\.zip$/i.test(input.name)&&bytes[0]===80&&bytes[1]===75)||(input.mime==='text/csv'&&/\.csv$/i.test(input.name))))throw new Error('FILE_LIMIT');return {size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}

 if(!input.name||input.name.length>180||/[\x00-\x1f\x7f/\\]/.test(input.name)||input.name.includes('..')||!bytes.length||bytes.length>(signature?2097152:10485760))throw new Error('FILE_LIMIT');
 const pdf=bytes.length>=12&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-'&&new TextDecoder().decode(bytes.subarray(Math.max(0,bytes.length-1024))).includes('%%EOF');
 const png=bytes.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 const jpeg=bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
 if(!(input.mime==='application/pdf'&&!signature&&pdf&&/\.pdf$/i.test(input.name))&&!(input.mime==='image/png'&&png&&/\.png$/i.test(input.name))&&!(input.mime==='image/jpeg'&&jpeg&&/\.jpe?g$/i.test(input.name)))throw new Error('FILE_LIMIT');
 if(png){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=view.getUint32(16),h=view.getUint32(20);if(!w||!h||w>4096||h>4096)throw new Error('FILE_LIMIT');}
 return {size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function boundedFileBody(request:Request,limit=10485760+16384){
 const reader=request.body?.getReader();if(!reader)throw new Error('FILE_LIMIT');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel().catch(()=>{});throw new Error('FILE_LIMIT');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export function attachmentHeaders(name:string,mime:string){return {'content-type':mime,'content-disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name)}`,'cache-control':'no-store','x-content-type-options':'nosniff'};}
