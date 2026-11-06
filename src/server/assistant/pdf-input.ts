export async function readPdfBody(request:Request):Promise<Uint8Array>{
 const limit=10485760;if(Number(request.headers.get('content-length'))>limit)throw new Error('FILE_LIMIT');
 const reader=request.body?.getReader();if(!reader)throw new Error('FILE_LIMIT');
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>limit){await reader.cancel();throw new Error('FILE_LIMIT');}parts.push(p.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('FILE_LIMIT');return bytes;
}
